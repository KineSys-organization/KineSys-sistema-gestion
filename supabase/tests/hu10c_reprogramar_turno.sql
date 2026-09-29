-- Pruebas HU-10C (reprogramar turno). Todo se revierte al final.
-- Requiere las migraciones 014 y 015 aplicadas.
--
-- Simula los roles con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
-- Cuentas: Mesa de Entradas carlaperez@ y el primer Profesional activo.
-- Necesita un profesional activo con franja y servicio con al menos 2 horarios libres en un día.
begin;

do $$
declare
  v_mesa uuid;
  v_prof_usuario uuid;
  v_prof uuid;
  v_serv uuid;
  v_dia integer;
  v_fecha date;
  v_sin_franja date;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_pasado date := (timezone('America/Argentina/Buenos_Aires', now()))::date - 400;
  v_disp jsonb;
  v_disp_excl jsonb;
  v_h0 time;
  v_h1 time;
  v_solapado time;
  v_pac1 uuid;
  v_pac2 uuid;
  v_t1 jsonb;
  v_t2 jsonb;
  v_antes jsonb;
  v_turno jsonb;
  v_cancelado jsonb;
  v_ausente uuid;
  v_atendido uuid;
  v_empezado uuid;
  v_cal jsonb;
  v_libres_antes integer;
  v_libres_despues integer;
begin
  -- ============ Datos de base (como postgres) ============
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select u.id_usuario into v_prof_usuario
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo = true
  order by u.mail_usuario
  limit 1;

  if v_mesa is null or v_prof_usuario is null then
    raise exception 'Faltan cuentas de prueba (Mesa de Entradas o Profesional activo)';
  end if;

  select f.id_usuario, sp.id_servicio, f.dia_semana
  into v_prof, v_serv, v_dia
  from public.franja_profesional f
  join public.profesional p on p.id_usuario = f.id_usuario and p.activo = true
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo = true
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo = true
  -- Preferimos un servicio con granularidad menor a la duración: permite probar
  -- correr el turno a un horario que se superpone con el suyo.
  order by (s.granularidad_minutos < s.duracion_minutos) desc
  limit 1;

  if v_prof is null then
    raise exception 'Falta un profesional con franja y servicio para probar';
  end if;

  select d::date into v_fecha
  from generate_series(v_hoy + 1, v_hoy + 30, interval '1 day') d
  where extract(isodow from d)::integer = v_dia
  order by d
  limit 1;

  -- Un día dentro de la ventana en el que el profesional NO tiene franja (si existe).
  select d::date into v_sin_franja
  from generate_series(v_hoy + 1, v_hoy + 30, interval '1 day') d
  where not exists (
    select 1 from public.franja_profesional f
    where f.id_usuario = v_prof and f.dia_semana = extract(isodow from d)::integer
  )
  order by d
  limit 1;

  -- ============ Sesión de Mesa de Entradas ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_disp := public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha);
  if jsonb_array_length(v_disp -> 'horarios') < 2 then
    raise exception 'Se necesitan al menos 2 horarios libres para probar';
  end if;
  v_h0 := (v_disp -> 'horarios' ->> 0)::time;
  v_h1 := (v_disp -> 'horarios' ->> (jsonb_array_length(v_disp -> 'horarios') - 1))::time;

  v_pac1 := public.fn_registrar_paciente(
    'Ana', 'TestHU10C', 99030301, date '1990-05-10',
    '1100000030', 'ana.hu10c.sql@test.com', '[]'::jsonb
  );
  v_pac2 := public.fn_registrar_paciente(
    'Beto', 'TestHU10C', 99030302, date '1985-03-20',
    '1100000031', 'beto.hu10c.sql@test.com', '[]'::jsonb
  );

  v_t1 := public.fn_otorgar_turno(v_pac1, v_prof, v_serv, v_fecha, v_h0, null);
  if (v_t1 ->> 'reprogramable')::boolean is not true then
    raise exception 'FALLA: un turno confirmado futuro tendría que ser reprogramable';
  end if;

  -- El calendario sigue funcionando con 2 argumentos (como lo llama /disponibilidad).
  v_cal := public.fn_consultar_disponibilidad_calendario(v_prof, v_serv);
  select (e ->> 'libres')::integer into v_libres_antes
  from jsonb_array_elements(v_cal -> 'dias') e where (e ->> 'fecha')::date = v_fecha;

  -- Excluyendo el propio turno, su horario figura libre (un horario más ese día).
  v_cal := public.fn_consultar_disponibilidad_calendario(v_prof, v_serv, (v_t1 ->> 'id_turno')::uuid);
  select (e ->> 'libres')::integer into v_libres_despues
  from jsonb_array_elements(v_cal -> 'dias') e where (e ->> 'fecha')::date = v_fecha;
  if v_libres_despues <= v_libres_antes then
    raise exception 'FALLA: excluir el turno no liberó su horario en el calendario';
  end if;

  -- ---------- Mismo horario: no hay nada que cambiar ----------
  begin
    perform public.fn_reprogramar_turno((v_t1 ->> 'id_turno')::uuid, v_fecha, v_h0);
    raise exception 'FALLA: reprogramó al mismo horario';
  exception when others then
    if sqlerrm <> 'Elegí un horario distinto al actual' then raise; end if;
  end;

  -- ---------- CA4/CA5: reprograma el MISMO turno y libera el horario anterior ----------
  v_turno := public.fn_reprogramar_turno((v_t1 ->> 'id_turno')::uuid, v_fecha, v_h1);
  if v_turno ->> 'id_turno' <> v_t1 ->> 'id_turno'
    or v_turno ->> 'estado' <> 'confirmado'
    or (v_turno ->> 'fecha')::date <> v_fecha
    or v_turno ->> 'hora_inicio' <> to_char(v_h1, 'HH24:MI')
    or v_turno ->> 'id_paciente' <> v_t1 ->> 'id_paciente'
    or v_turno ->> 'id_profesional' <> v_t1 ->> 'id_profesional'
    or v_turno ->> 'id_servicio' <> v_t1 ->> 'id_servicio'
    or v_turno ->> 'cobertura' <> v_t1 ->> 'cobertura' then
    raise exception 'FALLA: el turno reprogramado quedó mal: %', v_turno;
  end if;

  reset role; -- turno no tiene grants a authenticated: se cuenta como postgres
  if (select count(*) from public.turno where id_paciente = v_pac1) <> 1 then
    raise exception 'FALLA: reprogramar creó otro turno en vez de actualizar el existente';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);

  v_disp := public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha);
  if not ((v_disp -> 'horarios') ? to_char(v_h0, 'HH24:MI')) then
    raise exception 'FALLA: el horario anterior no quedó libre';
  end if;
  if (v_disp -> 'horarios') ? to_char(v_h1, 'HH24:MI') then
    raise exception 'FALLA: el horario nuevo figura libre';
  end if;

  -- ---------- CA6: horario ocupado → se rechaza y el original no cambia ----------
  v_t2 := public.fn_otorgar_turno(v_pac2, v_prof, v_serv, v_fecha, v_h0, null);
  v_antes := public.fn_obtener_turno((v_t1 ->> 'id_turno')::uuid);

  begin
    perform public.fn_reprogramar_turno((v_t1 ->> 'id_turno')::uuid, v_fecha, v_h0);
    raise exception 'FALLA: reprogramó a un horario ocupado';
  exception when others then
    if sqlerrm <> 'El horario seleccionado ya no está disponible' then raise; end if;
  end;

  if public.fn_obtener_turno((v_t1 ->> 'id_turno')::uuid) <> v_antes then
    raise exception 'FALLA: un rechazo modificó el turno original';
  end if;

  -- ---------- Correrlo a un horario que se superpone con el suyo (si la granularidad lo permite) ----------
  v_disp := public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha);
  v_disp_excl := public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha, (v_t1 ->> 'id_turno')::uuid);
  select h::time into v_solapado
  from jsonb_array_elements_text(v_disp_excl -> 'horarios') h
  where not ((v_disp -> 'horarios') ? h)
    and h::time <> v_h1
  limit 1;

  if v_solapado is not null then
    v_turno := public.fn_reprogramar_turno((v_t1 ->> 'id_turno')::uuid, v_fecha, v_solapado);
    if v_turno ->> 'hora_inicio' <> to_char(v_solapado, 'HH24:MI') then
      raise exception 'FALLA: no se pudo correr el turno a un horario superpuesto con el suyo';
    end if;
  end if;

  -- ---------- CA9: sin franja ese día no hay hueco ----------
  if v_sin_franja is not null then
    begin
      perform public.fn_reprogramar_turno((v_t1 ->> 'id_turno')::uuid, v_sin_franja, v_h0);
      raise exception 'FALLA: reprogramó a un día sin franja';
    exception when others then
      if sqlerrm <> 'El horario seleccionado ya no está disponible' then raise; end if;
    end;
  end if;

  -- ---------- Fuera de la ventana y en el pasado ----------
  begin
    perform public.fn_reprogramar_turno((v_t1 ->> 'id_turno')::uuid, v_hoy + 31, v_h0);
    raise exception 'FALLA: reprogramó a más de 30 días';
  exception when others then
    if sqlerrm <> 'Solo se puede consultar disponibilidad hasta 30 días desde hoy' then raise; end if;
  end;

  begin
    perform public.fn_reprogramar_turno((v_t1 ->> 'id_turno')::uuid, v_hoy - 1, v_h0);
    raise exception 'FALLA: reprogramó a una fecha pasada';
  exception when others then
    if sqlerrm <> 'No se puede reprogramar a una fecha y hora pasada' then raise; end if;
  end;

  -- ---------- CA7/CA8: estados y turnos que ya empezaron ----------
  v_cancelado := public.fn_cancelar_turno((v_t2 ->> 'id_turno')::uuid, 'otro', null);
  begin
    perform public.fn_reprogramar_turno((v_cancelado ->> 'id_turno')::uuid, v_fecha, v_h0);
    raise exception 'FALLA: reprogramó un turno cancelado';
  exception when others then
    if sqlerrm <> 'No se puede reprogramar un turno cancelado' then raise; end if;
  end;

  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac1, v_pasado, time '03:00', time '03:30', 'ausente')
  returning id_turno into v_ausente;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac1, v_pasado, time '04:00', time '04:30', 'atendido')
  returning id_turno into v_atendido;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac1, v_pasado, time '05:00', time '05:30', 'confirmado')
  returning id_turno into v_empezado;
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);

  begin
    perform public.fn_reprogramar_turno(v_ausente, v_fecha, v_h0);
    raise exception 'FALLA: reprogramó un turno ausente';
  exception when others then
    if sqlerrm <> 'No se puede reprogramar un turno marcado como ausente' then raise; end if;
  end;

  begin
    perform public.fn_reprogramar_turno(v_atendido, v_fecha, v_h0);
    raise exception 'FALLA: reprogramó un turno atendido';
  exception when others then
    if sqlerrm <> 'No se puede reprogramar un turno atendido' then raise; end if;
  end;

  if (public.fn_obtener_turno(v_empezado) ->> 'reprogramable')::boolean then
    raise exception 'FALLA: un turno que ya empezó figura como reprogramable';
  end if;

  begin
    perform public.fn_reprogramar_turno(v_empezado, v_fecha, v_h0);
    raise exception 'FALLA: reprogramó un turno que ya empezó';
  exception when others then
    if sqlerrm <> 'El turno ya comenzó o pasó; no se puede reprogramar' then raise; end if;
  end;

  begin
    perform public.fn_reprogramar_turno(gen_random_uuid(), v_fecha, v_h0);
    raise exception 'FALLA: reprogramó un turno inexistente';
  exception when others then
    if sqlerrm <> 'El turno no existe' then raise; end if;
  end;

  -- ---------- CA10: un Profesional no puede ----------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_usuario, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_reprogramar_turno((v_t1 ->> 'id_turno')::uuid, v_fecha, v_h0);
    raise exception 'FALLA: un Profesional pudo reprogramar';
  exception when others then
    if sqlerrm <> 'No tenés permiso para reprogramar turnos' then raise; end if;
  end;

  reset role;

  raise notice 'HU-10C: todas las pruebas pasaron (superpuesto probado: %, sin franja probado: %)',
    v_solapado is not null, v_sin_franja is not null;
end;
$$;

rollback;
