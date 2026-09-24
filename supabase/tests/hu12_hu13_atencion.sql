-- Pruebas HU-12 (mi agenda) y HU-13 (registrar atención). Todo se revierte al final.
-- Requiere la migración 010_hu12_hu13_atencion.sql aplicada.
--
-- Simula los roles con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
-- Cuentas: Mesa carlaperez@, Paciente juanrodriguez@, el primer Profesional activo con franja
-- y servicio ("A") y, como "otro profesional" ("B"), el Gerente joseodriozolarieszer@ pasado a
-- rol Profesional DENTRO de la transacción (hoy hay un solo Profesional activo; se revierte).
-- Los turnos de prueba se insertan como postgres a las 00:05 para no chocar con turnos reales.
begin;

do $$
declare
  v_mesa uuid;
  v_paciente_auth uuid;
  v_prof_b uuid;
  v_prof uuid;
  v_serv uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_pac uuid;
  v_hoy_turno uuid;   -- confirmado de hoy de A (se atiende)
  v_hoy_otro uuid;    -- confirmado de hoy de A (lo intenta B)
  v_manana uuid;      -- confirmado de mañana de A
  v_cancelado uuid;   -- cancelado de hoy de A
  v_res jsonb;
  v_agenda jsonb;
  v_atencion record;
  v_err text;
  v_n integer;
begin
  -- ============ Datos de base (como postgres) ============
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select id into v_paciente_auth from auth.users where email = 'juanrodriguez@gmail.com';
  select id into v_prof_b from auth.users where email = 'joseodriozolarieszer@gmail.com';

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

  if v_mesa is null or v_paciente_auth is null or v_prof_b is null or v_prof is null then
    raise exception 'Faltan cuentas de prueba (Mesa, Paciente, Gerente o Profesional activo con servicio)';
  end if;

  -- Paciente de prueba (lo registra Mesa, como en HU-10A).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pac := public.fn_registrar_paciente(
    'Carla', 'TestHU13', 99013101, date '1990-05-10',
    '1100000013', 'carla.hu13.sql@test.com', '[]'::jsonb
  );
  reset role;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:05', time '00:10', 'confirmado')
  returning id_turno into v_hoy_turno;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:10', time '00:15', 'confirmado')
  returning id_turno into v_hoy_otro;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy + 1, time '00:05', time '00:10', 'confirmado')
  returning id_turno into v_manana;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin,
    estado, motivo_cancelacion, cancelado_en)
  values (v_prof, v_serv, v_pac, v_hoy, time '00:15', time '00:20', 'cancelado', 'otro', now())
  returning id_turno into v_cancelado;

  -- "B": otro Profesional activo (el Gerente, solo dentro de esta transacción).
  update public.usuario set rol_usuario = 'Profesional' where id_usuario = v_prof_b;

  -- ============ Profesional A ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ---------- HU-12 CA1: su agenda, solo sus turnos ----------
  v_agenda := public.fn_consultar_agenda_profesional(v_prof, v_hoy);
  if exists (select 1 from jsonb_array_elements(v_agenda) e where (e ->> 'id_profesional')::uuid <> v_prof) then
    raise exception 'FALLA: la agenda propia trae turnos de otro profesional';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_agenda) e
    where (e ->> 'id_turno')::uuid = v_hoy_turno
      and (e ->> 'atendible')::boolean
      and e ->> 'apellido_paciente' = 'TestHU13'
  ) then
    raise exception 'FALLA: la agenda de hoy no muestra el turno atendible con su paciente';
  end if;

  v_agenda := public.fn_consultar_agenda_profesional(v_prof, v_hoy + 1);
  if not exists (
    select 1 from jsonb_array_elements(v_agenda) e
    where (e ->> 'id_turno')::uuid = v_manana and not (e ->> 'atendible')::boolean
  ) then
    raise exception 'FALLA: un turno de mañana no debería ser atendible';
  end if;

  -- ---------- HU-12 CA2: abre un turno del día y ve el paciente ----------
  v_res := public.fn_obtener_turno(v_hoy_turno);
  if v_res ->> 'nombre_paciente' <> 'Carla'
    or (v_res ->> 'dni_paciente')::integer <> 99013101
    or v_res ->> 'fecha_nacimiento_paciente' <> '1990-05-10'
    or not (v_res ->> 'atendible')::boolean
    or v_res -> 'atencion' <> 'null'::jsonb then
    raise exception 'FALLA: el detalle del turno propio quedó mal: %', v_res;
  end if;

  -- ---------- HU-13: validaciones ----------
  begin
    perform public.fn_registrar_atencion(v_hoy_turno, '   ', null);
    raise exception 'FALLA: registró sin observaciones';
  exception when others then
    if sqlerrm <> 'Tenés que escribir las observaciones de la atención' then raise; end if;
  end;

  begin
    perform public.fn_registrar_atencion(v_hoy_turno, repeat('x', 2001), null);
    raise exception 'FALLA: aceptó observaciones de más de 2000';
  exception when others then
    if sqlerrm <> 'Las observaciones no pueden superar los 2000 caracteres' then raise; end if;
  end;

  begin
    perform public.fn_registrar_atencion(v_hoy_turno, 'ok', repeat('m', 201));
    raise exception 'FALLA: aceptó un motivo de más de 200';
  exception when others then
    if sqlerrm <> 'El motivo de consulta no puede superar los 200 caracteres' then raise; end if;
  end;

  begin
    perform public.fn_registrar_atencion(v_manana, 'Todavía no vino', null);
    raise exception 'FALLA: registró la atención de un turno de mañana';
  exception when others then
    if sqlerrm <> 'Solo se puede registrar la atención de los turnos del día' then raise; end if;
  end;

  begin
    perform public.fn_registrar_atencion(v_cancelado, 'No vino', null);
    raise exception 'FALLA: registró la atención de un turno cancelado';
  exception when others then
    if sqlerrm <> 'No se puede registrar la atención de un turno cancelado' then raise; end if;
  end;

  begin
    perform public.fn_registrar_atencion(gen_random_uuid(), 'x', null);
    raise exception 'FALLA: registró sobre un turno inexistente';
  exception when others then
    if sqlerrm <> 'El turno no existe o no pertenece a tu agenda' then raise; end if;
  end;

  begin
    perform public.fn_editar_atencion(v_hoy_turno, 'Editar sin registrar', null);
    raise exception 'FALLA: editó una atención que no existe';
  exception when others then
    if sqlerrm <> 'Este turno todavía no tiene una atención registrada' then raise; end if;
  end;

  -- ---------- HU-13 CA1 + CA3: registrar con observaciones y motivo ----------
  v_res := public.fn_registrar_atencion(
    v_hoy_turno, '  Sesión 1: movilidad de rodilla, sin dolor.  ', '  Control  '
  );
  if v_res ->> 'estado' <> 'atendido'
    or (v_res ->> 'atendible')::boolean
    or v_res -> 'atencion' ->> 'observaciones' <> 'Sesión 1: movilidad de rodilla, sin dolor.'
    or v_res -> 'atencion' ->> 'motivo_consulta' <> 'Control'
    or v_res -> 'atencion' ->> 'fecha_atencion' <> v_hoy::text then
    raise exception 'FALLA: el registro devolvió mal el turno: %', v_res;
  end if;

  -- ---------- HU-13 CA2: registrar de nuevo se impide ----------
  begin
    perform public.fn_registrar_atencion(v_hoy_turno, 'Otra vez', null);
    raise exception 'FALLA: registró dos veces la misma atención';
  exception when others then
    if sqlerrm not like 'La atención de este turno ya fue registrada%' then raise; end if;
  end;

  -- ... salvo con la edición explícita (fecha, profesional y paciente no cambian).
  v_res := public.fn_editar_atencion(v_hoy_turno, 'Sesión 1 (corregido)', null);
  if v_res -> 'atencion' ->> 'observaciones' <> 'Sesión 1 (corregido)'
    or v_res -> 'atencion' -> 'motivo_consulta' <> 'null'::jsonb
    or v_res -> 'atencion' ->> 'editado_en' is null then
    raise exception 'FALLA: la edición quedó mal: %', v_res;
  end if;

  v_agenda := public.fn_consultar_agenda_profesional(v_prof, v_hoy);
  if not exists (
    select 1 from jsonb_array_elements(v_agenda) e
    where (e ->> 'id_turno')::uuid = v_hoy_turno
      and e ->> 'estado' = 'atendido'
      and not (e ->> 'atendible')::boolean
  ) then
    raise exception 'FALLA: la agenda no refleja el turno atendido';
  end if;

  -- ---------- Tablas cerradas: nada de acceso directo ----------
  begin
    select count(*) into v_n from public.atencion;
    raise exception 'FALLA: un Profesional leyó la tabla atencion directo';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into v_n from public.turno;
    raise exception 'FALLA: un Profesional leyó la tabla turno directo';
  exception when insufficient_privilege then null;
  end;

  -- ============ Profesional B: intenta con ids de A ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_b, 'role', 'authenticated')::text, true);

  begin
    perform public.fn_consultar_agenda_profesional(v_prof, v_hoy);
    raise exception 'FALLA: B vio la agenda de A';
  exception when others then
    if sqlerrm <> 'Solo podés consultar tu propia agenda' then raise; end if;
  end;

  begin
    perform public.fn_obtener_turno(v_hoy_turno);
    raise exception 'FALLA: B abrió un turno (y el paciente) de A';
  exception when others then
    if sqlerrm <> 'El turno no existe o no pertenece a tu agenda' then raise; end if;
  end;

  begin
    perform public.fn_registrar_atencion(v_hoy_otro, 'Atiendo yo', null);
    raise exception 'FALLA: B registró la atención de un turno de A';
  exception when others then
    if sqlerrm <> 'El turno no existe o no pertenece a tu agenda' then raise; end if;
  end;

  begin
    perform public.fn_editar_atencion(v_hoy_turno, 'Piso la atención de A', null);
    raise exception 'FALLA: B editó la atención de A';
  exception when others then
    if sqlerrm <> 'El turno no existe o no pertenece a tu agenda' then raise; end if;
  end;

  -- Un Profesional tampoco usa las funciones de pacientes de Recepción.
  begin
    perform public.fn_buscar_pacientes('TestHU13');
    raise exception 'FALLA: un Profesional buscó pacientes';
  exception when others then
    if sqlerrm !~* 'permiso' then raise; end if;
  end;

  -- ============ Mesa de Entradas ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);

  -- Ve el estado atendido (HU-07), pero no las observaciones clínicas.
  v_res := public.fn_obtener_turno(v_hoy_turno);
  if v_res ->> 'estado' <> 'atendido' or v_res -> 'atencion' <> 'null'::jsonb then
    raise exception 'FALLA: Mesa ve mal el turno atendido: %', v_res;
  end if;

  v_agenda := public.fn_consultar_agenda_profesional(v_prof, v_hoy);
  if not exists (
    select 1 from jsonb_array_elements(v_agenda) e
    where (e ->> 'id_turno')::uuid = v_hoy_turno and e ->> 'estado' = 'atendido'
  ) then
    raise exception 'FALLA: la agenda de Recepción no muestra el turno atendido';
  end if;

  -- Un turno atendido no se cancela (HU-10A).
  begin
    perform public.fn_cancelar_turno(v_hoy_turno, 'otro', null);
    raise exception 'FALLA: Mesa canceló un turno atendido';
  exception when others then
    if sqlerrm <> 'El turno ya fue atendido; no se puede cancelar' then raise; end if;
  end;

  -- Registrar la atención es solo del Profesional.
  begin
    perform public.fn_registrar_atencion(v_hoy_otro, 'Mesa', null);
    raise exception 'FALLA: Mesa registró una atención';
  exception when others then
    if sqlerrm <> 'No tenés permisos para realizar esta acción' then raise; end if;
  end;

  -- ============ Paciente ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_paciente_auth, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_consultar_agenda_profesional(v_prof, v_hoy);
    raise exception 'FALLA: un Paciente vio una agenda';
  exception when others then
    if sqlerrm <> 'No tenés permisos para realizar esta acción' then raise; end if;
  end;

  reset role;

  -- ============ Lo guardado (como postgres) ============
  select a.* into v_atencion from public.atencion a where a.id_turno = v_hoy_turno;
  if v_atencion.id_profesional <> v_prof
    or v_atencion.id_paciente <> v_pac
    or v_atencion.fecha_atencion <> v_hoy
    or v_atencion.observaciones <> 'Sesión 1 (corregido)' then
    raise exception 'FALLA: la fila de atencion quedó mal';
  end if;

  select count(*) into v_n from public.atencion where id_turno = v_hoy_turno;
  if v_n <> 1 then
    raise exception 'FALLA: hay % atenciones para el mismo turno', v_n;
  end if;

  if (select estado from public.turno where id_turno = v_hoy_otro) <> 'confirmado' then
    raise exception 'FALLA: el turno que intentó B cambió de estado';
  end if;

  -- El horario atendido sigue ocupado (turno_sin_superposicion).
  begin
    insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
    values (v_prof, v_serv, v_pac, v_hoy, time '00:05', time '00:10', 'confirmado');
    raise exception 'FALLA: se superpuso un turno sobre uno atendido';
  exception when exclusion_violation then null;
  end;

  raise notice 'HU-12/HU-13: todas las pruebas pasaron';
end;
$$;

rollback;
