-- Pruebas HU-34. Se crean dos pacientes temporales y todos los cambios se revierten.
-- Requiere Gerente/Mesa de Entradas, un Profesional con franja y un servicio asociado.
begin;

do $$
declare
  v_gerente uuid;
  v_profesional uuid;
  v_servicio uuid;
  v_id_con_turno uuid;
  v_id_sin_turnos uuid;
  v_id_turno uuid;
  v_dni_con_turno integer := 90000000 + floor(random() * 999999)::integer;
  v_dni_sin_turnos integer := 91000000 + floor(random() * 999999)::integer;
  v_fecha date;
  v_dia jsonb;
  v_hora time;
  v_paciente jsonb;
  v_cantidad integer;
begin
  select id_usuario into v_gerente
  from public.usuario
  where rol_usuario in ('Gerente', 'Mesa de Entradas') and activo = true
  order by case rol_usuario when 'Gerente' then 0 else 1 end
  limit 1;

  select f.id_usuario, sp.id_servicio
  into v_profesional, v_servicio
  from public.franja_profesional f
  join public.profesional p on p.id_usuario = f.id_usuario and p.activo = true
  join public.usuario u on u.id_usuario = f.id_usuario and u.activo = true
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo = true
  limit 1;

  if v_gerente is null or v_profesional is null or v_servicio is null then
    raise exception 'Falta Recepción/Gerente o un Profesional activo con servicio y franja';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text,
    true
  );

  v_id_con_turno := public.fn_registrar_paciente(
    'Prueba', 'HU34ConTurno', v_dni_con_turno, date '1990-01-01',
    '1100000001', 'hu34.' || gen_random_uuid() || '@test.com', '[]'::jsonb
  );
  v_id_sin_turnos := public.fn_registrar_paciente(
    'Prueba', 'HU34SinTurnos', v_dni_sin_turnos, date '1991-01-01',
    '1100000002', 'hu34.' || gen_random_uuid() || '@test.com', '[]'::jsonb
  );

  for v_fecha in select d::date from generate_series(
    (timezone('America/Argentina/Buenos_Aires', now()))::date + 1,
    (timezone('America/Argentina/Buenos_Aires', now()))::date + 30,
    interval '1 day'
  ) d loop
    v_dia := public.fn_consultar_disponibilidad(v_profesional, v_servicio, v_fecha);
    if jsonb_array_length(v_dia -> 'horarios') > 0 then
      v_hora := (v_dia -> 'horarios' ->> 0)::time;
      exit;
    end if;
  end loop;

  if v_hora is null then
    raise exception 'No hay turnos futuros libres para la prueba';
  end if;

  v_id_turno := (public.fn_otorgar_turno(
    v_id_con_turno, v_profesional, v_servicio, v_fecha, v_hora, null
  ) ->> 'id_turno')::uuid;

  v_paciente := public.fn_obtener_paciente(v_id_con_turno);
  if (v_paciente ->> 'activo')::boolean is distinct from true then
    raise exception 'La ficha debe informar al paciente activo';
  end if;
  if jsonb_array_length(v_paciente -> 'turnos_confirmados_futuros') <> 1 then
    raise exception 'La ficha debe listar el turno confirmado futuro';
  end if;
  if v_paciente -> 'turnos_confirmados_futuros' -> 0 ->> 'nombre_servicio' is null then
    raise exception 'La lista futura debe incluir el servicio';
  end if;

  perform public.fn_cambiar_estado_paciente(v_id_con_turno, false);
  if exists (select 1 from public.turno where id_turno = v_id_turno and estado <> 'confirmado') then
    raise exception 'Desactivar no debe modificar el estado del turno';
  end if;
  if not exists (select 1 from public.turno where id_turno = v_id_turno) then
    raise exception 'Desactivar no debe borrar el turno';
  end if;

  select count(*) into v_cantidad
  from public.fn_filtrar_pacientes(v_dni_con_turno::text, null, null, null, 'activos')
  where id_paciente = v_id_con_turno;
  if v_cantidad <> 0 then raise exception 'Paciente inactivo apareció en filtro Activos'; end if;

  select count(*) into v_cantidad
  from public.fn_filtrar_pacientes(v_dni_con_turno::text, null, null, null)
  where id_paciente = v_id_con_turno;
  if v_cantidad <> 0 then raise exception 'El filtro por defecto debe mostrar solo Activos'; end if;

  select count(*) into v_cantidad
  from public.fn_filtrar_pacientes(v_dni_con_turno::text, null, null, null, 'inactivos')
  where id_paciente = v_id_con_turno and activo = false;
  if v_cantidad <> 1 then raise exception 'Paciente inactivo no aparece en filtro Inactivos'; end if;

  select count(*) into v_cantidad
  from public.fn_filtrar_pacientes(v_dni_con_turno::text, null, null, null, 'todos')
  where id_paciente = v_id_con_turno;
  if v_cantidad <> 1 then raise exception 'Paciente inactivo no aparece en filtro Todos'; end if;

  begin
    perform public.fn_otorgar_turno(
      v_id_con_turno, v_profesional, v_servicio, v_fecha, v_hora, null
    );
    raise exception 'Debió rechazar un turno nuevo para un paciente inactivo';
  exception when raise_exception then
    if sqlerrm <> 'El paciente no existe o no está activo' then raise; end if;
  end;

  begin
    perform * from public.fn_turno_repetir_preview(v_id_turno, 1);
    raise exception 'Debió rechazar la repetición de un paciente inactivo';
  exception when raise_exception then
    if sqlerrm <> 'El paciente no existe o no está activo' then raise; end if;
  end;

  perform public.fn_cambiar_estado_paciente(v_id_con_turno, true);
  if not exists (
    select 1 from public.fn_filtrar_pacientes(v_dni_con_turno::text, null, null, null, 'activos')
    where id_paciente = v_id_con_turno and activo = true
  ) then
    raise exception 'Reactivar debe devolver el paciente a Activos';
  end if;
  select count(*) into v_cantidad
  from public.fn_buscar_pacientes(v_dni_con_turno::text)
  where id_paciente = v_id_con_turno;
  if v_cantidad <> 1 then raise exception 'Reactivar debe devolver al paso 1 de Otorgar turno'; end if;

  perform public.fn_cambiar_estado_paciente(v_id_sin_turnos, false);
  v_paciente := public.fn_obtener_paciente(v_id_sin_turnos);
  if jsonb_array_length(v_paciente -> 'turnos_confirmados_futuros') <> 0 then
    raise exception 'Paciente sin turnos debe devolver una lista vacía';
  end if;

  select id_usuario into v_profesional
  from public.usuario where rol_usuario = 'Profesional' and activo = true limit 1;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_profesional, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.fn_cambiar_estado_paciente(v_id_sin_turnos, true);
    raise exception 'El Profesional no debe cambiar el estado de un paciente';
  exception when raise_exception then
    if sqlerrm <> 'No tenés permisos para realizar esta acción' then raise; end if;
  end;

  raise notice 'HU-34 OK';
end;
$$;

rollback;
