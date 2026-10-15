-- Pruebas HU-38 (orden médica con datos automáticos, sesiones y detalle). Todo se revierte.
-- Requiere la migración 025_hu38_orden_medica_sesiones.sql aplicada.
--
-- Mismo armado que hu24a_orden_medica.sql: roles simulados con `set local role authenticated`
-- + `request.jwt.claims`. Mesa carlaperez@, el primer Profesional activo con servicio.
-- Los turnos de prueba se insertan como postgres a las 00:05 / 00:10 / 00:15 / 00:20.
begin;

do $$
declare
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_pac uuid;
  v_sin_orden uuid;   -- se atiende sin orden
  v_con_orden uuid;   -- orden completa
  v_vieja uuid;       -- orden de HU-24A (sin sesiones), cargada como postgres
  v_errores uuid;     -- para los rechazos
  v_res jsonb;
  v_n integer;
begin
  -- ============ Firmas: una sola versión de cada una ============
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('fn_registrar_atencion', 'fn_editar_atencion');
  if v_n <> 2 then
    raise exception 'FALLA: hay % versiones de registrar/editar atención (tienen que ser 2)', v_n;
  end if;

  -- ============ Datos de base ============
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';

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

  if v_mesa is null or v_prof is null then
    raise exception 'Faltan cuentas de prueba (Mesa o Profesional activo con servicio)';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pac := public.fn_registrar_paciente(
    'Ana', 'TestHU38', 99038101, date '1985-03-15',
    '1100000038', 'ana.hu38.sql@test.com', '[]'::jsonb
  );
  reset role;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:05', time '00:10', 'confirmado')
  returning id_turno into v_sin_orden;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:10', time '00:15', 'confirmado')
  returning id_turno into v_con_orden;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:15', time '00:20', 'atendido')
  returning id_turno into v_vieja;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:20', time '00:25', 'confirmado')
  returning id_turno into v_errores;

  -- Orden "vieja" de HU-24A: detalle sin sesiones.
  insert into public.atencion (id_turno, id_profesional, id_paciente, fecha_atencion, observaciones, orden_medica)
  values (v_vieja, v_prof, v_pac, v_hoy, 'Sesión vieja', 'Orden de HU-24A');

  -- ============ Profesional ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ---------- Rechazos ----------
  begin
    perform public.fn_registrar_atencion(v_errores, 'ok', null, 'Lesión de rodilla', null);
    raise exception 'FALLA: aceptó detalle sin sesiones';
  exception when others then
    if sqlerrm <> 'Indicá la cantidad de sesiones' then raise; end if;
  end;
  begin
    perform public.fn_registrar_atencion(v_errores, 'ok', null, '   ', 5);
    raise exception 'FALLA: aceptó sesiones sin detalle';
  exception when others then
    if sqlerrm <> 'Completá el detalle de la orden' then raise; end if;
  end;
  begin
    perform public.fn_registrar_atencion(v_errores, 'ok', null, 'Detalle', 0);
    raise exception 'FALLA: aceptó 0 sesiones';
  exception when others then
    if sqlerrm <> 'La cantidad de sesiones tiene que ser entre 1 y 50' then raise; end if;
  end;
  begin
    perform public.fn_registrar_atencion(v_errores, 'ok', null, 'Detalle', 51);
    raise exception 'FALLA: aceptó 51 sesiones';
  exception when others then
    if sqlerrm <> 'La cantidad de sesiones tiene que ser entre 1 y 50' then raise; end if;
  end;
  if (select estado from public.turno where id_turno = v_errores) <> 'confirmado' then
    raise exception 'FALLA: un rechazo cambió el estado del turno';
  end if;

  -- ---------- Atender sin orden (sigue siendo opcional) ----------
  v_res := public.fn_registrar_atencion(v_sin_orden, 'Sin orden', null);
  if v_res ->> 'estado' <> 'atendido'
    or v_res -> 'atencion' -> 'orden_medica' <> 'null'::jsonb
    or v_res -> 'atencion' -> 'orden_sesiones' <> 'null'::jsonb then
    raise exception 'FALLA: sin orden quedó mal: %', v_res -> 'atencion';
  end if;

  -- ---------- Orden completa + datos automáticos ----------
  v_res := public.fn_registrar_atencion(
    v_con_orden, 'Sesión 1', null, '  Lesión de rodilla. Magnetoterapia y electroterapia  ', 10
  );
  if v_res -> 'atencion' ->> 'orden_medica' <> 'Lesión de rodilla. Magnetoterapia y electroterapia'
    or (v_res -> 'atencion' ->> 'orden_sesiones')::int <> 10
    or v_res -> 'atencion' ->> 'orden_cobertura' <> 'Particular'
    or not (v_res ? 'matricula_profesional')
    or v_res ->> 'dni_paciente' <> '99038101' then
    raise exception 'FALLA: la orden completa quedó mal: %', v_res;
  end if;

  -- ---------- Editar: cambiar sesiones, después quitar la orden ----------
  v_res := public.fn_editar_atencion(v_con_orden, 'Sesión 1', null, 'Lesión de rodilla', 15);
  if (v_res -> 'atencion' ->> 'orden_sesiones')::int <> 15 then
    raise exception 'FALLA: no se editaron las sesiones';
  end if;
  begin
    perform public.fn_editar_atencion(v_con_orden, 'Sesión 1', null, 'Lesión de rodilla', null);
    raise exception 'FALLA: la edición dejó una orden nueva sin sesiones';
  exception when others then
    if sqlerrm <> 'Indicá la cantidad de sesiones' then raise; end if;
  end;
  v_res := public.fn_editar_atencion(v_con_orden, 'Sesión 1', null, '', null);
  if v_res -> 'atencion' -> 'orden_medica' <> 'null'::jsonb
    or v_res -> 'atencion' -> 'orden_sesiones' <> 'null'::jsonb then
    raise exception 'FALLA: no se quitó la orden';
  end if;

  -- ---------- Orden vieja (HU-24A): se ve y se puede editar la atención sin tocarla ----------
  v_res := public.fn_obtener_turno(v_vieja);
  if v_res -> 'atencion' ->> 'orden_medica' <> 'Orden de HU-24A'
    or v_res -> 'atencion' -> 'orden_sesiones' <> 'null'::jsonb then
    raise exception 'FALLA: la orden vieja no se ve: %', v_res -> 'atencion';
  end if;
  v_res := public.fn_editar_atencion(v_vieja, 'Sesión vieja corregida', null, 'Orden de HU-24A', null);
  if v_res -> 'atencion' ->> 'observaciones' <> 'Sesión vieja corregida' then
    raise exception 'FALLA: no se pudo editar una atención con orden vieja';
  end if;
  -- Si cambia el detalle, ahí sí pide sesiones.
  begin
    perform public.fn_editar_atencion(v_vieja, 'Sesión vieja', null, 'Otro detalle', null);
    raise exception 'FALLA: cambió el detalle viejo sin sesiones';
  exception when others then
    if sqlerrm <> 'Indicá la cantidad de sesiones' then raise; end if;
  end;

  -- ============ Mesa de Entradas: no ve la orden ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  v_res := public.fn_obtener_turno(v_vieja);
  if v_res -> 'atencion' <> 'null'::jsonb or v_res::text like '%orden_sesiones%' then
    raise exception 'FALLA: Mesa recibe la orden: %', v_res;
  end if;

  reset role;

  -- ============ Checks de la tabla (última defensa) ============
  begin
    update public.atencion set orden_sesiones = 60 where id_turno = v_vieja;
    raise exception 'FALLA: la tabla aceptó 60 sesiones';
  exception when check_violation then null;
  end;
  begin
    update public.atencion set orden_medica = null, orden_sesiones = 3 where id_turno = v_vieja;
    raise exception 'FALLA: la tabla aceptó sesiones sin detalle';
  exception when check_violation then null;
  end;

  raise notice 'HU-38: todas las pruebas pasaron';
end;
$$;

rollback;
