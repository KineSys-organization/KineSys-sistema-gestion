-- Pruebas HU-24B (historial de órdenes médicas del paciente). Todo se revierte al final.
-- Requiere las migraciones 025 (HU-38) y 026_hu24b_historial_ordenes.sql aplicadas.
--
-- Mismo armado que hu24a_orden_medica.sql. Cuentas: Mesa carlaperez@, Gerente
-- joseodriozolarieszer@ y el primer Profesional activo con servicio ("A"). Un segundo
-- usuario (Mesa, pasado a Profesional dentro de la transacción) hace de "B" sin turnos.
begin;

do $$
declare
  v_mesa uuid;
  v_gerente uuid;
  v_prof uuid;
  v_serv uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_pac uuid;
  v_pac_sin uuid;   -- paciente sin órdenes
  v_t1 uuid;
  v_t2 uuid;
  v_t3 uuid;        -- atendido sin orden
  v_res jsonb;
begin
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';

  select p.id_usuario, sp.id_servicio
  into v_prof, v_serv
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo = true
    and u.rol_usuario = 'Profesional'
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo = true
  where p.activo = true
  order by u.mail_usuario
  limit 1;

  if v_mesa is null or v_gerente is null or v_prof is null then
    raise exception 'Faltan cuentas de prueba';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pac := public.fn_registrar_paciente(
    'Ana', 'TestHU24B', 99024201, date '1985-03-15', '1100000242', 'ana.hu24b.sql@test.com', '[]'::jsonb
  );
  v_pac_sin := public.fn_registrar_paciente(
    'Beto', 'TestHU24B', 99024202, date '1990-01-01', '1100000243', 'beto.hu24b.sql@test.com', '[]'::jsonb
  );
  reset role;

  -- Dos atenciones con orden en días distintos y una sin orden (como postgres).
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy - 10, time '00:05', time '00:10', 'atendido')
  returning id_turno into v_t1;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy - 2, time '00:05', time '00:10', 'atendido')
  returning id_turno into v_t2;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy - 1, time '00:05', time '00:10', 'atendido')
  returning id_turno into v_t3;

  insert into public.atencion (id_turno, id_profesional, id_paciente, fecha_atencion, observaciones, motivo_consulta, orden_medica, orden_sesiones)
  values
    (v_t1, v_prof, v_pac, v_hoy - 10, 'OBS SECRETA 1', 'MOTIVO SECRETO', 'Orden vieja HU-24A', null),
    (v_t2, v_prof, v_pac, v_hoy - 2, 'OBS SECRETA 2', null, 'Lesión de rodilla', 10),
    (v_t3, v_prof, v_pac, v_hoy - 1, 'OBS SECRETA 3', null, null, null);

  -- ============ Gerente ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_res := public.fn_listar_ordenes_paciente(v_pac);
  if jsonb_array_length(v_res -> 'ordenes') <> 2
    or (v_res ->> 'total_sin_filtros')::int <> 2
    or v_res -> 'ordenes' -> 0 ->> 'orden_medica' <> 'Lesión de rodilla'      -- la más reciente primero
    or (v_res -> 'ordenes' -> 0 ->> 'orden_sesiones')::int <> 10
    or v_res -> 'ordenes' -> 1 -> 'orden_sesiones' <> 'null'::jsonb           -- vieja: no informadas
    or v_res -> 'ordenes' -> 0 ->> 'cobertura' <> 'Particular'
    or jsonb_array_length(v_res -> 'profesionales') <> 1 then
    raise exception 'FALLA: el listado del Gerente quedó mal: %', v_res;
  end if;

  -- Ni observaciones ni motivo.
  if v_res::text like '%OBS SECRETA%' or v_res::text like '%MOTIVO SECRETO%'
    or v_res::text like '%observaciones%' or v_res::text like '%motivo_consulta%' then
    raise exception 'FALLA: el historial filtra datos clínicos: %', v_res;
  end if;

  -- Filtros: rango y profesional, combinados.
  v_res := public.fn_listar_ordenes_paciente(v_pac, v_hoy - 5, v_hoy, null);
  if jsonb_array_length(v_res -> 'ordenes') <> 1 then
    raise exception 'FALLA: el filtro por fechas no anduvo';
  end if;
  v_res := public.fn_listar_ordenes_paciente(v_pac, null, null, gen_random_uuid());
  if jsonb_array_length(v_res -> 'ordenes') <> 0 or (v_res ->> 'total_sin_filtros')::int <> 2 then
    raise exception 'FALLA: filtro por profesional sin resultados quedó mal';
  end if;
  v_res := public.fn_listar_ordenes_paciente(v_pac, v_hoy - 30, v_hoy - 5, v_prof);
  if jsonb_array_length(v_res -> 'ordenes') <> 1
    or v_res -> 'ordenes' -> 0 ->> 'orden_medica' <> 'Orden vieja HU-24A' then
    raise exception 'FALLA: filtros combinados quedaron mal';
  end if;

  begin
    perform public.fn_listar_ordenes_paciente(v_pac, v_hoy, v_hoy - 1, null);
    raise exception 'FALLA: aceptó Hasta < Desde';
  exception when others then
    if sqlerrm <> 'La fecha Hasta no puede ser anterior a Desde' then raise; end if;
  end;

  -- Paciente sin órdenes: lista vacía, sin error.
  v_res := public.fn_listar_ordenes_paciente(v_pac_sin);
  if jsonb_array_length(v_res -> 'ordenes') <> 0 or (v_res ->> 'total_sin_filtros')::int <> 0 then
    raise exception 'FALLA: paciente sin órdenes quedó mal';
  end if;

  -- ============ Profesional A (tiene turnos con el paciente) ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  v_res := public.fn_listar_ordenes_paciente(v_pac);
  if jsonb_array_length(v_res -> 'ordenes') <> 2 then
    raise exception 'FALLA: el profesional con turnos no ve el historial';
  end if;

  -- Sin turnos con el otro paciente.
  begin
    perform public.fn_listar_ordenes_paciente(v_pac_sin);
    raise exception 'FALLA: un profesional sin turnos vio el historial';
  exception when others then
    if sqlerrm <> 'No tenés turnos con este paciente' then raise; end if;
  end;

  -- ============ Mesa de Entradas: bloqueada ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_listar_ordenes_paciente(v_pac);
    raise exception 'FALLA: Mesa vio el historial de órdenes';
  exception when others then
    if sqlerrm <> 'No tenés permisos para realizar esta acción' then raise; end if;
  end;

  -- ============ Otro Profesional sin turnos con el paciente ============
  reset role;
  update public.usuario set rol_usuario = 'Profesional' where id_usuario = v_mesa;
  set local role authenticated;
  begin
    perform public.fn_listar_ordenes_paciente(v_pac);
    raise exception 'FALLA: un Profesional sin turnos vio el historial';
  exception when others then
    if sqlerrm <> 'No tenés turnos con este paciente' then raise; end if;
  end;

  reset role;
  raise notice 'HU-24B: todas las pruebas pasaron';
end;
$$;

rollback;
