-- Pruebas HU-24A (orden médica al atender un turno). Todo se revierte al final.
-- Requiere la migración 019_hu24a_orden_medica.sql aplicada.
--
-- Mismo armado que hu12_hu13_atencion.sql: roles simulados con `set local role authenticated`
-- + `request.jwt.claims`. Cuentas: Mesa carlaperez@, el primer Profesional activo con servicio
-- ("A") y el Gerente joseodriozolarieszer@, que primero hace de "otro profesional" ("B",
-- pasado a rol Profesional dentro de la transacción) y después vuelve a ser Gerente.
-- Los turnos de prueba se insertan como postgres a las 00:05 / 00:10 / 00:15.
begin;

do $$
declare
  v_mesa uuid;
  v_gerente uuid;
  v_prof uuid;
  v_serv uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_pac uuid;
  v_con_orden uuid;   -- se atiende con orden
  v_sin_orden uuid;   -- se atiende sin orden (solo espacios)
  v_otro uuid;        -- confirmado de A: lo intenta B
  v_res jsonb;
  v_orden text;
  v_editado timestamptz;
  v_n integer;
begin
  -- ============ Firmas: no quedan sobrecargas de HU-13 ============
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_registrar_atencion';
  if v_n <> 1 then
    raise exception 'FALLA: hay % versiones de fn_registrar_atencion', v_n;
  end if;

  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_editar_atencion';
  if v_n <> 1 then
    raise exception 'FALLA: hay % versiones de fn_editar_atencion', v_n;
  end if;

  -- ============ Datos de base (como postgres) ============
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
    raise exception 'Faltan cuentas de prueba (Mesa, Gerente o Profesional activo con servicio)';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pac := public.fn_registrar_paciente(
    'Ana', 'TestHU24A', 99024101, date '1985-03-15',
    '1100000024', 'ana.hu24a.sql@test.com', '[]'::jsonb
  );
  reset role;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:05', time '00:10', 'confirmado')
  returning id_turno into v_con_orden;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:10', time '00:15', 'confirmado')
  returning id_turno into v_sin_orden;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:15', time '00:20', 'confirmado')
  returning id_turno into v_otro;

  update public.usuario set rol_usuario = 'Profesional' where id_usuario = v_gerente;

  -- ============ Profesional A ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ---------- Orden de 2001 caracteres: rechazada por la función ----------
  begin
    perform public.fn_registrar_atencion(v_con_orden, 'ok', null, repeat('o', 2001));
    raise exception 'FALLA: aceptó una orden de más de 2000';
  exception when others then
    if sqlerrm <> 'La orden médica no puede superar los 2000 caracteres' then raise; end if;
  end;

  -- Regresión HU-13: las reglas de observaciones y motivo no cambiaron.
  begin
    perform public.fn_registrar_atencion(v_con_orden, '   ', null, 'Orden');
    raise exception 'FALLA: registró sin observaciones';
  exception when others then
    if sqlerrm <> 'Tenés que escribir las observaciones de la atención' then raise; end if;
  end;
  begin
    perform public.fn_registrar_atencion(v_con_orden, repeat('x', 2001), null, null);
    raise exception 'FALLA: aceptó observaciones de más de 2000';
  exception when others then
    if sqlerrm <> 'Las observaciones no pueden superar los 2000 caracteres' then raise; end if;
  end;
  begin
    perform public.fn_registrar_atencion(v_con_orden, 'ok', repeat('m', 201), null);
    raise exception 'FALLA: aceptó un motivo de más de 200';
  exception when others then
    if sqlerrm <> 'El motivo de consulta no puede superar los 200 caracteres' then raise; end if;
  end;

  -- ---------- Registrar con orden (2000 justos entran) ----------
  v_orden := '  Dx: lumbalgia. ' || repeat('i', 1985) || '  ';  -- 15 + 1985 = 2000 después del trim
  v_res := public.fn_registrar_atencion(v_con_orden, 'Sesión 1', 'Control', v_orden);
  if v_res ->> 'estado' <> 'atendido'
    or char_length(v_res -> 'atencion' ->> 'orden_medica') <> 2000
    or v_res -> 'atencion' ->> 'orden_medica' <> trim(v_orden)
    or v_res -> 'atencion' ->> 'observaciones' <> 'Sesión 1'
    or v_res -> 'atencion' ->> 'motivo_consulta' <> 'Control'
    or v_res -> 'atencion' ->> 'registrado_en' is null
    or v_res -> 'atencion' -> 'editado_en' <> 'null'::jsonb then
    raise exception 'FALLA: el registro con orden quedó mal: %', v_res -> 'atencion';
  end if;

  -- Al volver a abrir el turno se ve la orden.
  v_res := public.fn_obtener_turno(v_con_orden);
  if v_res -> 'atencion' ->> 'orden_medica' <> trim(v_orden) then
    raise exception 'FALLA: la orden no se ve al volver a abrir el turno';
  end if;

  -- ---------- Registrar sin orden (solo espacios = null), con la llamada de 3 parámetros ----------
  v_res := public.fn_registrar_atencion(v_sin_orden, 'Sesión sin orden', null);
  if v_res ->> 'estado' <> 'atendido'
    or v_res -> 'atencion' -> 'orden_medica' <> 'null'::jsonb then
    raise exception 'FALLA: sin orden quedó mal: %', v_res -> 'atencion';
  end if;

  -- ---------- Editar la orden: cambia el valor y se actualiza editado_en ----------
  v_res := public.fn_editar_atencion(v_con_orden, 'Sesión 1', 'Control', '  Nueva orden: 10 sesiones  ');
  if v_res -> 'atencion' ->> 'orden_medica' <> 'Nueva orden: 10 sesiones'
    or v_res -> 'atencion' ->> 'editado_en' is null then
    raise exception 'FALLA: la edición de la orden quedó mal: %', v_res -> 'atencion';
  end if;

  begin
    perform public.fn_editar_atencion(v_con_orden, 'Sesión 1', null, repeat('o', 2001));
    raise exception 'FALLA: la edición aceptó una orden de más de 2000';
  exception when others then
    if sqlerrm <> 'La orden médica no puede superar los 2000 caracteres' then raise; end if;
  end;

  -- Agregarle una orden a una atención que no tenía, y después quitarla (solo espacios).
  v_res := public.fn_editar_atencion(v_sin_orden, 'Sesión sin orden', null, 'Agregada después');
  if v_res -> 'atencion' ->> 'orden_medica' <> 'Agregada después' then
    raise exception 'FALLA: no se pudo agregar la orden al editar';
  end if;
  v_res := public.fn_editar_atencion(v_sin_orden, 'Sesión sin orden', null, '   ');
  if v_res -> 'atencion' -> 'orden_medica' <> 'null'::jsonb then
    raise exception 'FALLA: vaciar la orden no la dejó en null';
  end if;

  -- ============ Profesional B (no dueño) ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);

  begin
    perform public.fn_obtener_turno(v_con_orden);
    raise exception 'FALLA: B vio el turno (y la orden) de A';
  exception when others then
    if sqlerrm <> 'El turno no existe o no pertenece a tu agenda' then raise; end if;
  end;
  begin
    perform public.fn_registrar_atencion(v_otro, 'Atiendo yo', null, 'Orden de B');
    raise exception 'FALLA: B registró una orden en un turno de A';
  exception when others then
    if sqlerrm <> 'El turno no existe o no pertenece a tu agenda' then raise; end if;
  end;
  begin
    perform public.fn_editar_atencion(v_con_orden, 'Piso', null, 'Orden de B');
    raise exception 'FALLA: B editó la orden de A';
  exception when others then
    if sqlerrm <> 'El turno no existe o no pertenece a tu agenda' then raise; end if;
  end;

  -- ============ Mesa de Entradas: ve el turno, no la orden ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);

  v_res := public.fn_obtener_turno(v_con_orden);
  if v_res ->> 'estado' <> 'atendido'
    or v_res -> 'atencion' <> 'null'::jsonb
    or v_res::text like '%orden_medica%'
    or v_res::text like '%Nueva orden%' then
    raise exception 'FALLA: Mesa recibe la orden médica: %', v_res;
  end if;

  begin
    perform public.fn_registrar_atencion(v_otro, 'Mesa', null, 'Orden de Mesa');
    raise exception 'FALLA: Mesa registró una orden';
  exception when others then
    if sqlerrm <> 'No tenés permisos para realizar esta acción' then raise; end if;
  end;

  -- ============ Gerente: tampoco la ve ============
  reset role;
  update public.usuario set rol_usuario = 'Gerente' where id_usuario = v_gerente;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_res := public.fn_obtener_turno(v_con_orden);
  if v_res -> 'atencion' <> 'null'::jsonb or v_res::text like '%orden_medica%' then
    raise exception 'FALLA: el Gerente recibe la orden médica: %', v_res;
  end if;

  begin
    perform public.fn_editar_atencion(v_con_orden, 'Gerente', null, 'Orden del Gerente');
    raise exception 'FALLA: el Gerente editó una orden';
  exception when others then
    if sqlerrm <> 'No tenés permisos para realizar esta acción' then raise; end if;
  end;

  -- Acceso directo a la tabla sigue cerrado.
  begin
    select count(*) into v_n from public.atencion;
    raise exception 'FALLA: se leyó la tabla atencion directo';
  exception when insufficient_privilege then null;
  end;

  reset role;

  -- ============ Lo guardado (como postgres) ============
  select a.orden_medica, a.editado_en into v_orden, v_editado
  from public.atencion a where a.id_turno = v_con_orden;
  if v_orden <> 'Nueva orden: 10 sesiones' or v_editado is null then
    raise exception 'FALLA: la fila con orden quedó mal';
  end if;

  select a.orden_medica into v_orden from public.atencion a where a.id_turno = v_sin_orden;
  if v_orden is not null then
    raise exception 'FALLA: la fila sin orden no quedó en null';
  end if;

  if (select estado from public.turno where id_turno = v_otro) <> 'confirmado' then
    raise exception 'FALLA: el turno que intentaron B / Mesa cambió de estado';
  end if;

  -- El check de la tabla también frena más de 2000 (última defensa).
  begin
    update public.atencion set orden_medica = repeat('o', 2001) where id_turno = v_con_orden;
    raise exception 'FALLA: la tabla aceptó una orden de más de 2000';
  exception when check_violation then null;
  end;

  raise notice 'HU-24A: todas las pruebas pasaron';
end;
$$;

rollback;
