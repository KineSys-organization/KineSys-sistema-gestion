-- Pruebas HU-10B (marcar y corregir ausencia). Todo se revierte al final.
-- Requiere la migración 014_hu10b_marcar_ausencia.sql aplicada.
--
-- Simula los roles con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
-- Cuentas: Mesa de Entradas carlaperez@ y el primer Profesional activo.
-- Necesita un profesional activo con franja y servicio (HU-02A/02B) con un horario libre.
begin;

do $$
declare
  v_mesa uuid;
  v_prof_usuario uuid;
  v_prof uuid;
  v_serv uuid;
  v_dia integer;
  v_fecha date;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_ahora timestamp := timezone('America/Argentina/Buenos_Aires', now());
  v_pasado date := (timezone('America/Argentina/Buenos_Aires', now()))::date - 400;
  v_disp jsonb;
  v_hora time;
  v_pac uuid;
  v_futuro jsonb;
  v_turno jsonb;
  v_ausente uuid;
  v_atendido uuid;
  v_con_atencion uuid;
  v_cancelado uuid;
  v_en_curso uuid;
  v_agenda jsonb;
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
  limit 1;

  if v_prof is null then
    raise exception 'Falta un profesional con franja y servicio para probar';
  end if;

  select d::date into v_fecha
  from generate_series(v_hoy + 1, v_hoy + 30, interval '1 day') d
  where extract(isodow from d)::integer = v_dia
  order by d
  limit 1;

  -- ============ Sesión de Mesa de Entradas ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_pac := public.fn_registrar_paciente(
    'Ana', 'TestHU10B', 99020201, date '1990-05-10',
    '1100000020', 'ana.hu10b.sql@test.com', '[]'::jsonb
  );

  -- Turno futuro (confirmado, no empezó).
  v_disp := public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha);
  if jsonb_array_length(v_disp -> 'horarios') < 1 then
    raise exception 'Se necesita al menos un horario libre para probar';
  end if;
  v_hora := (v_disp -> 'horarios' ->> 0)::time;
  v_futuro := public.fn_otorgar_turno(v_pac, v_prof, v_serv, v_fecha, v_hora, null);

  -- Turnos pasados y en curso: se insertan directo, como postgres.
  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, time '03:00', time '03:30', 'confirmado')
  returning id_turno into v_ausente;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, time '04:00', time '04:30', 'atendido')
  returning id_turno into v_atendido;

  -- Confirmado pero con fila en atencion (no tendría que pasar, pero la regla lo cubre).
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, time '05:00', time '05:30', 'confirmado')
  returning id_turno into v_con_atencion;
  insert into public.atencion (id_turno, id_profesional, id_paciente, fecha_atencion, observaciones)
  values (v_con_atencion, v_prof, v_pac, v_pasado, 'Prueba HU-10B');

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion)
  values (v_prof, v_serv, v_pac, v_pasado, time '06:00', time '06:30', 'cancelado', 'otro')
  returning id_turno into v_cancelado;

  -- En curso: empezó hace 10 minutos y termina en 20 (se saltea cerca de medianoche).
  if v_ahora::time between time '00:15' and time '23:30' then
    insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
    values (
      v_prof, v_serv, v_pac, v_hoy,
      date_trunc('minute', v_ahora - interval '10 minutes')::time,
      date_trunc('minute', v_ahora + interval '20 minutes')::time,
      'confirmado'
    )
    returning id_turno into v_en_curso;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);

  -- ---------- CA2: antes del inicio no se puede ----------
  if (v_futuro ->> 'marcable_ausente')::boolean then
    raise exception 'FALLA: un turno futuro figura como marcable ausente';
  end if;

  begin
    perform public.fn_marcar_ausente((v_futuro ->> 'id_turno')::uuid);
    raise exception 'FALLA: marcó ausente un turno futuro';
  exception when others then
    if sqlerrm <> 'Solo se puede marcar la ausencia cuando terminó el horario del turno' then raise; end if;
  end;

  -- ---------- CA2: durante el turno no se puede ----------
  if v_en_curso is not null then
    begin
      perform public.fn_marcar_ausente(v_en_curso);
      raise exception 'FALLA: marcó ausente un turno en curso';
    exception when others then
      if sqlerrm <> 'Solo se puede marcar la ausencia cuando terminó el horario del turno' then raise; end if;
    end;
  end if;

  -- ---------- CA1: confirmado, sin atención y terminado → Ausente ----------
  if (public.fn_obtener_turno(v_ausente) ->> 'marcable_ausente')::boolean is not true then
    raise exception 'FALLA: un turno pasado sin atención tendría que ser marcable';
  end if;

  v_turno := public.fn_marcar_ausente(v_ausente);
  if v_turno ->> 'estado' <> 'ausente'
    or (v_turno ->> 'marcable_ausente')::boolean
    or (v_turno ->> 'ausencia_corregible')::boolean is not true
    or (v_turno ->> 'cancelable')::boolean then
    raise exception 'FALLA: el turno ausente quedó mal: %', v_turno;
  end if;

  -- ---------- CA6: la agenda muestra el estado guardado ----------
  v_agenda := public.fn_consultar_agenda_profesional(v_prof, v_pasado);
  if not exists (
    select 1 from jsonb_array_elements(v_agenda) e
    where e ->> 'id_turno' = v_ausente::text and e ->> 'estado' = 'ausente'
  ) then
    raise exception 'FALLA: la agenda no muestra el turno ausente';
  end if;

  -- ---------- CA3: ni ausente dos veces, ni cancelado, ni atendido ----------
  begin
    perform public.fn_marcar_ausente(v_ausente);
    raise exception 'FALLA: marcó ausente dos veces';
  exception when others then
    if sqlerrm <> 'El turno ya está marcado como ausente' then raise; end if;
  end;

  begin
    perform public.fn_marcar_ausente(v_cancelado);
    raise exception 'FALLA: marcó ausente un turno cancelado';
  exception when others then
    if sqlerrm <> 'No se puede marcar como ausente un turno cancelado' then raise; end if;
  end;

  begin
    perform public.fn_marcar_ausente(v_atendido);
    raise exception 'FALLA: marcó ausente un turno atendido';
  exception when others then
    if sqlerrm <> 'El turno tiene una atención registrada; no se puede marcar como ausente' then raise; end if;
  end;

  if (public.fn_obtener_turno(v_con_atencion) ->> 'marcable_ausente')::boolean then
    raise exception 'FALLA: un turno con atención figura como marcable';
  end if;

  begin
    perform public.fn_marcar_ausente(v_con_atencion);
    raise exception 'FALLA: marcó ausente un turno con atención registrada';
  exception when others then
    if sqlerrm <> 'El turno tiene una atención registrada; no se puede marcar como ausente' then raise; end if;
  end;

  -- Tampoco se cancela un ausente (HU-10A ya lo cubría).
  begin
    perform public.fn_cancelar_turno(v_ausente, 'otro', null);
    raise exception 'FALLA: canceló un turno ausente';
  exception when others then
    if sqlerrm <> 'El turno ya fue marcado como ausente' then raise; end if;
  end;

  -- Turno inexistente.
  begin
    perform public.fn_marcar_ausente(gen_random_uuid());
    raise exception 'FALLA: marcó un turno inexistente';
  exception when others then
    if sqlerrm <> 'El turno no existe' then raise; end if;
  end;

  -- ---------- CA7: el ausente sigue ocupando su horario ----------
  reset role;
  begin
    insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
    values (v_prof, v_serv, v_pac, v_pasado, time '03:00', time '03:30', 'confirmado');
    raise exception 'FALLA: se pudo superponer un turno sobre uno ausente';
  exception when exclusion_violation then
    null; -- esperado
  end;
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);

  -- ---------- CA4/CA5: corregir vuelve a Confirmado y conserva los datos ----------
  begin
    perform public.fn_corregir_ausencia((v_futuro ->> 'id_turno')::uuid);
    raise exception 'FALLA: corrigió un turno que no estaba ausente';
  exception when others then
    if sqlerrm <> 'Solo se puede corregir la ausencia de un turno marcado como ausente' then raise; end if;
  end;

  v_turno := public.fn_corregir_ausencia(v_ausente);
  if v_turno ->> 'estado' <> 'confirmado'
    or (v_turno ->> 'fecha')::date <> v_pasado
    or v_turno ->> 'hora_inicio' <> '03:00'
    or (v_turno ->> 'id_paciente')::uuid <> v_pac
    or (v_turno ->> 'ausencia_corregible')::boolean
    -- Corregir no habilita atender fuera del día del turno (HU-13).
    or (v_turno ->> 'atendible')::boolean then
    raise exception 'FALLA: la corrección cambió más que el estado: %', v_turno;
  end if;

  begin
    perform public.fn_corregir_ausencia(v_ausente);
    raise exception 'FALLA: corrigió dos veces';
  exception when others then
    if sqlerrm <> 'Solo se puede corregir la ausencia de un turno marcado como ausente' then raise; end if;
  end;

  -- ---------- CA8: un Profesional no puede ----------
  perform public.fn_marcar_ausente(v_ausente); -- queda ausente para probar corregir
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_usuario, 'role', 'authenticated')::text, true);

  begin
    perform public.fn_marcar_ausente(v_con_atencion);
    raise exception 'FALLA: un Profesional pudo marcar ausencia';
  exception when others then
    if sqlerrm <> 'No tenés permiso para marcar ausencias' then raise; end if;
  end;

  begin
    perform public.fn_corregir_ausencia(v_ausente);
    raise exception 'FALLA: un Profesional pudo corregir una ausencia';
  exception when others then
    if sqlerrm <> 'No tenés permiso para corregir ausencias' then raise; end if;
  end;

  reset role;

  -- El registro no se borra.
  if not exists (select 1 from public.turno where id_turno = v_ausente and estado = 'ausente') then
    raise exception 'FALLA: el turno ausente no se conservó';
  end if;

  raise notice 'HU-10B: todas las pruebas pasaron';
end;
$$;

rollback;
