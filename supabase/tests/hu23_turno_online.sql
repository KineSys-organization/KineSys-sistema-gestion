-- Pruebas HU-23 (sacar turno online). Todo se revierte al final (rollback).
-- Requiere la migración 035_hu23_turno_online.sql aplicada.
--
-- Cuentas: Paciente juanrodriguez@ (se le da una ficha con su mail), Mesa carlaperez@ y
-- el primer Profesional activo con servicio y franjas. El turno se saca sobre un horario
-- libre real que devuelve el propio calendario del portal.
begin;

do $$
declare
  v_pac_auth uuid;
  v_pac_mail text;
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_pac uuid;
  v_otro uuid;
  v_ajeno uuid;
  v_pasado uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_res jsonb;
  v_cal jsonb;
  v_fecha date;
  v_hora text;
  v_turno uuid;
  v_n integer;
begin
  -- ============ Datos de base (como postgres) ============
  select id, email into v_pac_auth, v_pac_mail from auth.users where email = 'juanrodriguez@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';

  select p.id_usuario, sp.id_servicio
  into v_prof, v_serv
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo = true
    and u.rol_usuario = 'Profesional'
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo = true
  where p.activo = true
    and exists (select 1 from public.franja_profesional f where f.id_usuario = p.id_usuario)
  order by u.mail_usuario
  limit 1;

  if v_pac_auth is null or v_mesa is null or v_prof is null then
    raise exception 'Faltan cuentas de prueba (Paciente, Mesa o Profesional con franjas)';
  end if;

  -- El mail de la cuenta tiene que estar confirmado y tener una sola ficha.
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_pac_auth;
  update public.paciente set mail_paciente = null
  where lower(mail_paciente) = lower(v_pac_mail) and id_paciente <> v_pac_auth;

  -- Ficha del paciente (la registra Mesa, como en HU-04) con el mail de la cuenta.
  if not exists (select 1 from public.paciente where id_paciente = v_pac_auth) then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_pac := public.fn_registrar_paciente(
      'Juan', 'TestHU23', 99023101, date '1990-01-01', '1100000023', v_pac_mail, '[]'::jsonb
    );
    -- Otro paciente, para probar que no se ven ni cancelan turnos ajenos.
    v_otro := public.fn_registrar_paciente(
      'Otra', 'TestHU23', 99023102, date '1991-01-01', '1100000024', 'otra.hu23.sql@test.com', '[]'::jsonb
    );
    reset role;
  else
    v_pac := v_pac_auth;
    select id_paciente into v_otro from public.paciente where id_paciente <> v_pac_auth limit 1;
  end if;

  -- Turno de otro paciente y uno pasado del paciente (insertados como postgres).
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_otro, v_hoy + 25, time '00:05', time '00:10', 'confirmado')
  returning id_turno into v_ajeno;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy - 2, time '00:05', time '00:10', 'confirmado')
  returning id_turno into v_pasado;

  -- Origen por defecto: lo que carga Recepción queda 'recepcion'.
  if (select origen from public.turno where id_turno = v_ajeno) <> 'recepcion' then
    raise exception 'FALLA: el origen por defecto no es recepcion';
  end if;

  -- ============ Paciente ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pac_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_res := public.fn_acceso_paciente();
  if (v_res ->> 'id_paciente')::uuid <> v_pac then
    raise exception 'FALLA: fn_acceso_paciente no encontró la ficha: %', v_res;
  end if;

  -- Catálogo: el servicio del profesional elegido aparece con él.
  v_res := public.fn_paciente_catalogo();
  if not exists (
    select 1
    from jsonb_array_elements(v_res) s, jsonb_array_elements(s -> 'profesionales') p
    where (s ->> 'id_servicio')::uuid = v_serv and (p ->> 'id_profesional')::uuid = v_prof
  ) then
    raise exception 'FALLA: el catálogo no trae el servicio/profesional';
  end if;

  -- Calendario de 31 días (hoy + 30) y primer horario libre.
  v_cal := public.fn_paciente_calendario(v_prof, v_serv);
  if jsonb_array_length(v_cal -> 'dias') <> 31 then
    raise exception 'FALLA: el calendario no tiene 31 días';
  end if;
  select (d ->> 'fecha')::date into v_fecha
  from jsonb_array_elements(v_cal -> 'dias') d
  where (d ->> 'libres')::int > 0
  order by (d ->> 'fecha')::date
  limit 1;
  if v_fecha is null then
    raise exception 'Faltan datos: el profesional no tiene horarios libres en 30 días';
  end if;

  v_res := public.fn_paciente_horarios(v_prof, v_serv, v_fecha);
  v_hora := v_res -> 'horarios' ->> 0;
  if v_res ? 'bloqueados' or v_res ? 'en_franja' then
    raise exception 'FALLA: el portal expone el detalle interno de la agenda';
  end if;

  -- Ventana y pasado.
  begin
    perform public.fn_paciente_horarios(v_prof, v_serv, v_hoy - 1);
    raise exception 'FALLA: consultó una fecha pasada';
  exception when others then
    if sqlerrm <> 'No se puede consultar una fecha pasada' then raise; end if;
  end;
  begin
    perform public.fn_paciente_horarios(v_prof, v_serv, v_hoy + 31);
    raise exception 'FALLA: consultó más allá de 30 días';
  exception when others then
    if sqlerrm <> 'Solo se pueden sacar turnos hasta 30 días desde hoy' then raise; end if;
  end;

  -- Cobertura que no es suya.
  begin
    perform public.fn_paciente_sacar_turno(v_prof, v_serv, v_fecha, v_hora::time,
      (select id_obra_social from public.obra_social limit 1));
    raise exception 'FALLA: aceptó una obra social que no es del paciente';
  exception when others then
    if sqlerrm <> 'La obra social elegida no es una de tus coberturas activas' then raise; end if;
  end;

  -- Sacar el turno: confirmado, online, normal, Particular.
  v_res := public.fn_paciente_sacar_turno(v_prof, v_serv, v_fecha, v_hora::time, null);
  v_turno := (v_res ->> 'id_turno')::uuid;
  if v_res ->> 'estado' <> 'confirmado' or v_res ->> 'origen' <> 'online'
    or v_res ->> 'cobertura' <> 'Particular' or not (v_res ->> 'cancelable')::boolean then
    raise exception 'FALLA: el turno online quedó mal: %', v_res;
  end if;
  if (select prioridad from public.turno where id_turno = v_turno) <> 'normal' then
    raise exception 'FALLA: el turno online no quedó con prioridad normal';
  end if;
  if v_res ? 'atencion' or v_res ? 'pago' or v_res ? 'prioridad' then
    raise exception 'FALLA: el portal devuelve datos que no son del paciente';
  end if;

  -- El mismo horario ya no está.
  begin
    perform public.fn_paciente_sacar_turno(v_prof, v_serv, v_fecha, v_hora::time, null);
    raise exception 'FALLA: dio dos veces el mismo horario';
  exception when others then
    if sqlerrm not in ('El horario seleccionado ya no está disponible', 'Ya tenés un turno en ese horario') then
      raise;
    end if;
  end;

  -- Mis turnos: el nuevo en próximos, el pasado en anteriores, el ajeno en ninguno.
  v_res := public.fn_paciente_mis_turnos();
  if not exists (select 1 from jsonb_array_elements(v_res -> 'proximos') t where (t ->> 'id_turno')::uuid = v_turno) then
    raise exception 'FALLA: el turno nuevo no está en próximos';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_res -> 'anteriores') t where (t ->> 'id_turno')::uuid = v_pasado) then
    raise exception 'FALLA: el turno pasado no está en anteriores';
  end if;
  if v_res::text like '%' || v_ajeno::text || '%' then
    raise exception 'FALLA: se ve un turno de otro paciente';
  end if;

  -- Cancelar: ajeno y pasado no; el propio sí.
  begin
    perform public.fn_paciente_cancelar_turno(v_ajeno);
    raise exception 'FALLA: canceló un turno ajeno';
  exception when others then
    if sqlerrm <> 'El turno no existe o no es tuyo' then raise; end if;
  end;
  begin
    perform public.fn_paciente_cancelar_turno(v_pasado);
    raise exception 'FALLA: canceló un turno que ya empezó';
  exception when others then
    if sqlerrm <> 'El turno ya empezó; comunicate con Recepción' then raise; end if;
  end;

  v_res := public.fn_paciente_cancelar_turno(v_turno);
  if v_res ->> 'estado' <> 'cancelado' or (v_res ->> 'cancelable')::boolean then
    raise exception 'FALLA: no quedó cancelado: %', v_res;
  end if;
  begin
    perform public.fn_paciente_cancelar_turno(v_turno);
    raise exception 'FALLA: canceló dos veces';
  exception when others then
    if sqlerrm <> 'Solo se puede cancelar un turno confirmado' then raise; end if;
  end;
  reset role;

  if (select motivo_cancelacion from public.turno where id_turno = v_turno) <> 'pedido_paciente' then
    raise exception 'FALLA: el motivo de la cancelación no es pedido_paciente';
  end if;

  -- Cancelado libera el horario: se puede volver a sacar.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pac_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := public.fn_paciente_sacar_turno(v_prof, v_serv, v_fecha, v_hora::time, null);
  reset role;

  -- Ficha inactiva (HU-34): no entra.
  update public.paciente set activo = false where id_paciente = v_pac;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pac_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.fn_acceso_paciente();
    raise exception 'FALLA: entró un paciente inactivo';
  exception when others then
    if sqlerrm <> 'Tu ficha de paciente está inactiva. Comunicate con el centro' then raise; end if;
  end;
  reset role;
  update public.paciente set activo = true where id_paciente = v_pac;

  -- ============ Personal de gestión: no usa el portal ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.fn_paciente_catalogo();
    raise exception 'FALLA: Mesa de Entradas usó el portal';
  exception when others then
    if sqlerrm <> 'El turno online es solo para pacientes. Usá el sistema de gestión' then raise; end if;
  end;
  -- Y la Mesa ve el turno online como cualquier otro (HU-06/HU-07).
  v_res := public.fn_obtener_turno(v_turno);
  if v_res ->> 'estado' <> 'cancelado' then
    raise exception 'FALLA: Recepción no ve el turno online';
  end if;
  reset role;

  -- Las internas no se pueden llamar por RPC.
  select count(*) into v_n
  from unnest(array['fn_paciente_actual()', 'fn_paciente_turno_json(uuid)']) f
  where has_function_privilege('authenticated', 'public.' || f, 'execute');
  if v_n <> 0 then
    raise exception 'FALLA: authenticated puede ejecutar un helper interno';
  end if;

  raise notice 'HU-23: todas las pruebas pasaron';
end;
$$;

rollback;
