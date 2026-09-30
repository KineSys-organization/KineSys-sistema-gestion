-- Pruebas HU-25 (repetir un turno en las próximas semanas). Todo se revierte al final.
-- Requiere la migración 018 aplicada.
--
-- Simula los roles con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
-- Cuentas: Mesa de Entradas carlaperez@ y el primer Profesional activo con franja y servicio.
-- Los turnos "origen" se cargan como postgres en fechas lejanas (sin turnos reales), así
-- las pruebas no dependen de la agenda del día. La ventana de 30 días no aplica a la serie.
begin;

do $$
declare
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_dia integer;
  v_hora time;
  v_duracion integer;
  v_pac uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_base date;
  v_origen uuid;
  v_otro uuid;
  v_res jsonb;
  v_prev record;
  v_cant integer;
  v_serie uuid;
  v_sabado date;
  v_hora_sab time;
  v_cerca date;
  v_h_cerca time;
  v_h_nueva time;
  v_disp0 jsonb;
  v_disp1 jsonb;
  v_disp2 jsonb;
  v_antes text;
  v_despues text;
  v_t1 uuid;
  v_t2 uuid;
  v_pasado uuid;
  v_reprogramar_probado boolean := false;
begin
  -- ============ Datos de base (como postgres) ============
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';

  select f.id_usuario, sp.id_servicio, f.dia_semana, f.hora_inicio, s.duracion_minutos
  into v_prof, v_serv, v_dia, v_hora, v_duracion
  from public.franja_profesional f
  join public.profesional p on p.id_usuario = f.id_usuario and p.activo = true
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo = true
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo = true
  where f.hora_inicio + make_interval(mins => s.duracion_minutos) <= f.hora_fin
  order by u.mail_usuario, f.dia_semana, f.hora_inicio
  limit 1;

  select id_paciente into v_pac from public.paciente where activo = true limit 1;

  if v_mesa is null or v_prof is null or v_pac is null then
    raise exception 'Faltan datos de prueba (Mesa de Entradas, Profesional con franja o paciente)';
  end if;

  -- Primer día de la franja a más de 200 días (nadie tiene turnos tan lejos).
  v_base := v_hoy + 200;
  while extract(isodow from v_base)::integer <> v_dia loop
    v_base := v_base + 1;
  end loop;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_base, v_hora, v_hora + make_interval(mins => v_duracion), 'confirmado')
  returning id_turno into v_origen;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ---------- CA1/CA3/CA4: 4 semanas sin conflictos ----------
  select count(*) filter (where disponible)
  into v_cant
  from public.fn_turno_repetir_preview(v_origen, 4);
  if v_cant <> 4 then
    raise exception 'FALLA: el preview de 4 semanas libres dio % disponibles', v_cant;
  end if;

  v_res := public.fn_turno_repetir_confirmar(v_origen, 4);
  if jsonb_array_length(v_res -> 'creados') <> 4 or jsonb_array_length(v_res -> 'omitidos') <> 0 then
    raise exception 'FALLA: se esperaban 4 creados y 0 omitidos: %', v_res;
  end if;
  v_serie := (v_res ->> 'id_serie')::uuid;

  reset role; -- turno no tiene grants a authenticated: se cuenta como postgres
  select count(*) into v_cant
  from public.turno
  where id_serie = v_serie
    and id_paciente = v_pac and id_profesional = v_prof and id_servicio = v_serv
    and hora_inicio = v_hora and estado = 'confirmado'
    and extract(isodow from fecha)::integer = v_dia;
  if v_cant <> 5 then -- el original + 4 nuevos
    raise exception 'FALLA: la serie tiene % turnos (se esperaban 5 con el original)', v_cant;
  end if;
  if not exists (select 1 from public.serie_turno where id_serie = v_serie and id_turno_origen = v_origen and creada_por = v_mesa) then
    raise exception 'FALLA: la serie no guardó el turno origen o quién la creó';
  end if;

  -- ---------- CA5: una semana ocupada → se crean las demás ----------
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_base + 70, v_hora, v_hora + make_interval(mins => v_duracion), 'confirmado')
  returning id_turno into v_otro;
  -- Ocupa la 2ª semana de la serie que arranca en v_base + 70.
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_base + 84, v_hora, v_hora + make_interval(mins => v_duracion), 'confirmado');

  set local role authenticated;
  select * into v_prev from public.fn_turno_repetir_preview(v_otro, 4) where fecha = v_base + 84;
  if v_prev.disponible or v_prev.motivo <> 'Horario ocupado' then
    raise exception 'FALLA: el preview no marcó la fecha ocupada (%)', row_to_json(v_prev);
  end if;

  v_res := public.fn_turno_repetir_confirmar(v_otro, 4);
  if jsonb_array_length(v_res -> 'creados') <> 3
    or v_res -> 'omitidos' <> jsonb_build_array(jsonb_build_object('fecha', v_base + 84, 'motivo', 'Horario ocupado')) then
    raise exception 'FALLA: semana ocupada mal informada: %', v_res;
  end if;

  -- ---------- Carrera: alguien toma una fecha entre el preview y la confirmación ----------
  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_base + 140, v_hora, v_hora + make_interval(mins => v_duracion), 'confirmado')
  returning id_turno into v_otro;

  set local role authenticated;
  select count(*) into v_cant from public.fn_turno_repetir_preview(v_otro, 2) where disponible;
  if v_cant <> 2 then
    raise exception 'FALLA: el preview de la carrera debía dar 2 libres y dio %', v_cant;
  end if;

  reset role; -- "otra recepcionista" toma la 1ª semana
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_base + 147, v_hora, v_hora + make_interval(mins => v_duracion), 'confirmado');

  set local role authenticated;
  v_res := public.fn_turno_repetir_confirmar(v_otro, 2); -- no tiene que tirar error
  if jsonb_array_length(v_res -> 'creados') <> 1
    or v_res #>> '{omitidos,0,motivo}' <> 'Horario ocupado' then
    raise exception 'FALLA: la carrera no omitió la fecha tomada: %', v_res;
  end if;

  -- ---------- CA7: límites de semanas ----------
  begin
    perform * from public.fn_turno_repetir_preview(v_origen, 0);
    raise exception 'FALLA: aceptó 0 semanas';
  exception when others then
    if sqlerrm <> 'Podés repetir el turno entre 1 y 24 semanas' then raise; end if;
  end;

  begin
    perform public.fn_turno_repetir_confirmar(v_origen, 25);
    raise exception 'FALLA: aceptó 25 semanas';
  exception when others then
    if sqlerrm <> 'Podés repetir el turno entre 1 y 24 semanas' then raise; end if;
  end;

  -- 24 sí se puede (preview: 24 filas, ninguna cortada por los 30 días).
  select count(*) into v_cant from public.fn_turno_repetir_preview(v_origen, 24);
  if v_cant <> 24 then
    raise exception 'FALLA: el preview de 24 semanas devolvió % filas', v_cant;
  end if;

  -- ---------- CA1: turno no confirmado o sin paciente ----------
  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion, cancelado_en)
  values (v_prof, v_serv, v_pac, v_base + 210, v_hora, v_hora + make_interval(mins => v_duracion), 'cancelado', 'otro', now())
  returning id_turno into v_otro;

  set local role authenticated;
  begin
    perform * from public.fn_turno_repetir_preview(v_otro, 2);
    raise exception 'FALLA: repitió un turno cancelado';
  exception when others then
    if sqlerrm <> 'Solo se puede repetir un turno confirmado' then raise; end if;
  end;

  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, null, v_base + 217, v_hora, v_hora + make_interval(mins => v_duracion), 'confirmado')
  returning id_turno into v_otro;

  set local role authenticated;
  begin
    perform public.fn_turno_repetir_confirmar(v_otro, 2);
    raise exception 'FALLA: repitió un turno sin paciente';
  exception when others then
    if sqlerrm <> 'El turno no tiene un paciente asociado' then raise; end if;
  end;

  begin
    perform * from public.fn_turno_repetir_preview(gen_random_uuid(), 2);
    raise exception 'FALLA: repitió un turno inexistente';
  exception when others then
    if sqlerrm <> 'El turno no existe' then raise; end if;
  end;

  -- ---------- CA8: sábado solo si el profesional tiene franja ese día ----------
  reset role;
  select min(f.hora_inicio) into v_hora_sab
  from public.franja_profesional f
  where f.id_usuario = v_prof and f.dia_semana = 6
    and f.hora_inicio + make_interval(mins => v_duracion) <= f.hora_fin;

  if v_hora_sab is null then
    -- No tiene franja el sábado: se le crea una a primera hora (se revierte al final).
    v_hora_sab := time '06:00';
    if exists (select 1 from public.franja_profesional where id_usuario = v_prof and dia_semana = 6) then
      raise exception 'Datos de prueba: el profesional tiene una franja de sábado demasiado corta';
    end if;
    insert into public.franja_profesional (id_usuario, dia_semana, hora_inicio, hora_fin)
    values (v_prof, 6, v_hora_sab, v_hora_sab + make_interval(mins => v_duracion));
  end if;

  v_sabado := v_base + 280;
  while extract(isodow from v_sabado)::integer <> 6 loop
    v_sabado := v_sabado + 1;
  end loop;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_sabado, v_hora_sab, v_hora_sab + make_interval(mins => v_duracion), 'confirmado')
  returning id_turno into v_otro;

  set local role authenticated;
  select * into v_prev from public.fn_turno_repetir_preview(v_otro, 1);
  if not v_prev.disponible then
    raise exception 'FALLA: con franja el sábado debía estar disponible (%)', row_to_json(v_prev);
  end if;

  reset role;
  delete from public.franja_profesional where id_usuario = v_prof and dia_semana = 6;

  set local role authenticated;
  select * into v_prev from public.fn_turno_repetir_preview(v_otro, 1);
  if v_prev.disponible or v_prev.motivo <> 'Fuera de la franja del profesional' then
    raise exception 'FALLA: sin franja el sábado debía salir fuera de franja (%)', row_to_json(v_prev);
  end if;

  v_res := public.fn_turno_repetir_confirmar(v_otro, 1);
  if jsonb_array_length(v_res -> 'creados') <> 0 or v_res ->> 'id_serie' is not null then
    raise exception 'FALLA: sin fechas libres no se tiene que crear nada: %', v_res;
  end if;

  -- ---------- Profesional inactivo ----------
  reset role;
  update public.profesional set activo = false where id_usuario = v_prof;

  set local role authenticated;
  select * into v_prev from public.fn_turno_repetir_preview(v_origen, 1);
  if v_prev.disponible or v_prev.motivo <> 'Profesional inactivo' then
    raise exception 'FALLA: profesional inactivo mal informado (%)', row_to_json(v_prev);
  end if;

  reset role;
  update public.profesional set activo = true where id_usuario = v_prof;

  -- ---------- Permisos: un Profesional no puede ----------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.fn_turno_repetir_preview(v_origen, 2);
    raise exception 'FALLA: un Profesional pudo ver el preview';
  exception when others then
    if sqlerrm <> 'No tenés permiso para repetir turnos' then raise; end if;
  end;
  begin
    perform public.fn_turno_repetir_confirmar(v_origen, 2);
    raise exception 'FALLA: un Profesional pudo repetir';
  exception when others then
    if sqlerrm <> 'No tenés permiso para repetir turnos' then raise; end if;
  end;

  -- ---------- CA6: independencia (cancelar, ausente, reprogramar) ----------
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);

  -- Cancelar un turno de la serie del principio (v_base + 14).
  select string_agg(id_turno || estado || fecha || hora_inicio, ',' order by fecha) into v_antes
  from public.turno where id_serie = v_serie and fecha <> v_base + 14;
  select id_turno into v_t1 from public.turno where id_serie = v_serie and fecha = v_base + 14;

  set local role authenticated;
  perform public.fn_cancelar_turno(v_t1, 'otro', null);
  reset role;

  select string_agg(id_turno || estado || fecha || hora_inicio, ',' order by fecha) into v_despues
  from public.turno where id_serie = v_serie and fecha <> v_base + 14;
  if v_antes <> v_despues or (select estado from public.turno where id_turno = v_t1) <> 'cancelado' then
    raise exception 'FALLA: cancelar un turno de la serie tocó a los demás';
  end if;

  -- Ausente: una sesión de la serie que ya pasó (se carga en el pasado como postgres).
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, id_serie)
  values (v_prof, v_serv, v_pac, v_hoy - 400, v_hora, v_hora + make_interval(mins => v_duracion), 'confirmado', v_serie)
  returning id_turno into v_pasado;

  select string_agg(id_turno || estado || fecha || hora_inicio, ',' order by fecha) into v_antes
  from public.turno where id_serie = v_serie and id_turno <> v_pasado;

  set local role authenticated;
  perform public.fn_marcar_ausente(v_pasado);
  reset role;

  select string_agg(id_turno || estado || fecha || hora_inicio, ',' order by fecha) into v_despues
  from public.turno where id_serie = v_serie and id_turno <> v_pasado;
  if v_antes <> v_despues or (select estado from public.turno where id_turno = v_pasado) <> 'ausente' then
    raise exception 'FALLA: marcar ausente un turno de la serie tocó a los demás';
  end if;

  -- Reprogramar: necesita una serie dentro de los 30 días (regla de HU-10C).
  -- Se busca un día cercano con el mismo horario libre en 3 semanas seguidas.
  for v_cerca in
    select d::date from generate_series(v_hoy + 1, v_hoy + 7, interval '1 day') d
  loop
    v_disp0 := public.fn_horarios_del_dia(v_prof, v_serv, v_cerca);
    v_disp1 := public.fn_horarios_del_dia(v_prof, v_serv, v_cerca + 7);
    v_disp2 := public.fn_horarios_del_dia(v_prof, v_serv, v_cerca + 14);

    select h.hora::time into v_h_cerca
    from jsonb_array_elements_text(v_disp0 -> 'horarios') as h(hora)
    where (v_disp1 -> 'horarios') ? h.hora and (v_disp2 -> 'horarios') ? h.hora
    limit 1;

    if v_h_cerca is not null then
      select h.hora::time into v_h_nueva
      from jsonb_array_elements_text(v_disp1 -> 'horarios') as h(hora)
      where h.hora::time <> v_h_cerca
        and (h.hora::time >= v_h_cerca + make_interval(mins => v_duracion)
          or h.hora::time + make_interval(mins => v_duracion) <= v_h_cerca)
      limit 1;
      exit when v_h_nueva is not null;
    end if;
  end loop;

  if v_h_cerca is not null and v_h_nueva is not null then
    insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
    values (v_prof, v_serv, v_pac, v_cerca, v_h_cerca, v_h_cerca + make_interval(mins => v_duracion), 'confirmado')
    returning id_turno into v_otro;

    set local role authenticated;
    v_res := public.fn_turno_repetir_confirmar(v_otro, 2);
    reset role;

    v_t1 := (v_res #>> '{creados,0,id_turno}')::uuid; -- semana 1
    v_t2 := (v_res #>> '{creados,1,id_turno}')::uuid; -- semana 2
    if v_t1 is null or v_t2 is null then
      raise exception 'FALLA: la serie cercana no creó las 2 semanas: %', v_res;
    end if;

    select string_agg(id_turno || estado || fecha || hora_inicio, ',' order by fecha) into v_antes
    from public.turno where id_serie = (v_res ->> 'id_serie')::uuid and id_turno <> v_t1;

    set local role authenticated;
    perform public.fn_reprogramar_turno(v_t1, v_cerca + 7, v_h_nueva);
    reset role;

    select string_agg(id_turno || estado || fecha || hora_inicio, ',' order by fecha) into v_despues
    from public.turno where id_serie = (v_res ->> 'id_serie')::uuid and id_turno <> v_t1;
    if v_antes <> v_despues or (select hora_inicio from public.turno where id_turno = v_t1) <> v_h_nueva then
      raise exception 'FALLA: reprogramar un turno de la serie tocó a los demás';
    end if;
    v_reprogramar_probado := true;
  end if;

  -- ---------- La disponibilidad de siempre no cambió (sigue sin 'en_franja' y con 30 días) ----------
  set local role authenticated;
  v_disp0 := public.fn_consultar_disponibilidad(v_prof, v_serv, v_hoy + 1);
  if v_disp0 ? 'en_franja' then
    raise exception 'FALLA: fn_consultar_disponibilidad devuelve un dato interno';
  end if;
  begin
    perform public.fn_consultar_disponibilidad(v_prof, v_serv, v_hoy + 31);
    raise exception 'FALLA: la disponibilidad dejó de cortar a los 30 días';
  exception when others then
    if sqlerrm <> 'Solo se puede consultar disponibilidad hasta 30 días desde hoy' then raise; end if;
  end;

  -- Las funciones internas no se pueden llamar desde el front.
  begin
    perform public.fn_horarios_del_dia(v_prof, v_serv, v_hoy + 1);
    raise exception 'FALLA: authenticated puede llamar a fn_horarios_del_dia';
  exception when insufficient_privilege then
    null;
  end;

  reset role;

  raise notice 'HU-25: todas las pruebas pasaron (reprogramar probado: %)', v_reprogramar_probado;
end;
$$;

rollback;
