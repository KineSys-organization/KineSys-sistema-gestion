-- Pruebas HU-17 (estado de cobro de cada turno). Todo se revierte al final.
-- Requiere las migraciones 014 (ausencia), 017 (pagos), 023 (reembolso) y 024 aplicadas.
--
-- Simula los roles con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
-- Cuentas: Mesa de Entradas carlaperez@ y el primer Profesional activo con un servicio.
begin;

do $$
declare
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_pasado date := (timezone('America/Argentina/Buenos_Aires', now()))::date - 520;
  v_pac uuid;
  v_t_pend uuid;      -- confirmado sin pago            → pendiente
  v_t_atend uuid;     -- atendido sin pago              → pendiente
  v_t_pagado uuid;    -- confirmado con pago            → pagado
  v_t_canc_pag uuid;  -- pagado y después cancelado     → sigue pagado
  v_t_ausente uuid;   -- ausente sin pago → no_corresponde; corregido → pendiente
  v_t_cancelado uuid; -- cancelado sin pago             → no_corresponde
  v_t_reemb uuid;     -- pagado y reembolsado           → reembolsado
  v_res jsonb;
  v_cobros jsonb;
begin
  -- ============ Datos de base (como postgres) ============
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';

  select p.id_usuario, sp.id_servicio into v_prof, v_serv
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo = true
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  where p.activo = true
  order by u.mail_usuario
  limit 1;

  if v_mesa is null or v_prof is null then
    raise exception 'Faltan datos de prueba (Mesa de Entradas o profesional con servicio)';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pac := public.fn_registrar_paciente(
    'Ana', 'TestHU17', 99170101, date '1990-05-10', '1100000171', 'ana.hu17.sql@test.com', '[]'::jsonb
  );

  -- Turnos en un día pasado y horas de madrugada (no chocan con turnos reales).
  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, '01:00', '01:30', 'confirmado') returning id_turno into v_t_pend;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, '02:00', '02:30', 'atendido') returning id_turno into v_t_atend;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, '03:00', '03:30', 'confirmado') returning id_turno into v_t_pagado;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, '04:00', '04:30', 'confirmado') returning id_turno into v_t_canc_pag;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, '05:00', '05:30', 'confirmado') returning id_turno into v_t_ausente;
  -- Un cancelado necesita motivo (turno_cancelado_con_motivo, HU-10A).
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado,
    motivo_cancelacion)
  values (v_prof, v_serv, v_pac, v_pasado, '06:00', '06:30', 'cancelado', 'otro')
  returning id_turno into v_t_cancelado;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, '07:00', '07:30', 'confirmado') returning id_turno into v_t_reemb;

  -- ============ Sesión de Mesa de Entradas ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Pendiente: confirmado o atendido sin pago.
  assert public.fn_obtener_turno(v_t_pend) ->> 'estado_cobro' = 'pendiente', 'confirmado sin pago';
  assert public.fn_obtener_turno(v_t_atend) ->> 'estado_cobro' = 'pendiente', 'atendido sin pago';
  -- No corresponde: cancelado sin pago.
  assert public.fn_obtener_turno(v_t_cancelado) ->> 'estado_cobro' = 'no_corresponde', 'cancelado sin pago';
  raise notice 'OK pendiente y no corresponde';

  -- Registrar el pago (HU-14) → Pagado.
  perform public.fn_registrar_pago(v_t_pagado, 10000, 0, 'efectivo');
  assert public.fn_obtener_turno(v_t_pagado) ->> 'estado_cobro' = 'pagado', 'con pago';
  assert public.fn_obtener_pago(v_t_pagado) -> 'turno' ->> 'estado_cobro' = 'pagado', 'también en fn_obtener_pago';
  raise notice 'OK registrar el pago lo pasa a pagado';

  -- Pagado y después cancelado: sigue Pagado. (Un turno pasado no se cancela con
  -- fn_cancelar_turno; el estado se cambia directo para probar la regla.)
  perform public.fn_registrar_pago(v_t_canc_pag, 10000, 0, 'debito');
  reset role;
  update public.turno set estado = 'cancelado', motivo_cancelacion = 'pedido_paciente'
  where id_turno = v_t_canc_pag;
  set local role authenticated;
  assert public.fn_obtener_turno(v_t_canc_pag) ->> 'estado_cobro' = 'pagado', 'cancelado con pago sigue pagado';
  raise notice 'OK cancelado con pago sigue pagado';

  -- Ausente sin pago → No corresponde; corregir la ausencia (HU-10B) → vuelve a Pendiente.
  perform public.fn_marcar_ausente(v_t_ausente);
  assert public.fn_obtener_turno(v_t_ausente) ->> 'estado_cobro' = 'no_corresponde', 'ausente sin pago';
  perform public.fn_corregir_ausencia(v_t_ausente);
  assert public.fn_obtener_turno(v_t_ausente) ->> 'estado_cobro' = 'pendiente', 'ausencia corregida';
  raise notice 'OK ausente sin pago y ausencia corregida';

  -- Pagado y reembolsado (HU-22) → Reembolsado.
  perform public.fn_registrar_pago(v_t_reemb, 10000, 0, 'transferencia');
  perform public.fn_registrar_reembolso(v_t_reemb, 'pedido_paciente', null, null);
  assert public.fn_obtener_turno(v_t_reemb) ->> 'estado_cobro' = 'reembolsado', 'con reembolso';
  assert public.fn_obtener_pago(v_t_reemb) -> 'turno' ->> 'estado_cobro' = 'reembolsado';
  raise notice 'OK reembolsado';

  -- ============ Listado de turnos (HU-09): columna y filtro ============
  v_res := public.fn_buscar_turnos('TestHU17', null, null, v_pasado, v_pasado, null, 1, null);
  assert (v_res ->> 'total')::integer = 7, 'Los 7 turnos de prueba';
  assert v_res -> 'turnos' -> 0 ? 'estado_cobro', 'Cada fila trae el estado de cobro';

  assert (public.fn_buscar_turnos('TestHU17', null, null, v_pasado, v_pasado, null, 1, 'pendiente') ->> 'total')::integer = 3;
  assert (public.fn_buscar_turnos('TestHU17', null, null, v_pasado, v_pasado, null, 1, 'pagado') ->> 'total')::integer = 2;
  assert (public.fn_buscar_turnos('TestHU17', null, null, v_pasado, v_pasado, null, 1, 'reembolsado') ->> 'total')::integer = 1;
  assert (public.fn_buscar_turnos('TestHU17', null, null, v_pasado, v_pasado, null, 1, 'no_corresponde') ->> 'total')::integer = 1;
  assert (public.fn_buscar_turnos('TestHU17', null, null, v_pasado, v_pasado, null, 1, 'todos') ->> 'total')::integer = 7;
  -- Combinable con los demás filtros: cancelado + pagado.
  assert (public.fn_buscar_turnos('TestHU17', null, null, v_pasado, v_pasado, 'cancelado', 1, 'pagado') ->> 'total')::integer = 1;

  begin
    perform public.fn_buscar_turnos(null, null, null, null, null, null, 1, 'parcial');
    raise exception 'Debía rechazar un estado de cobro inválido';
  exception when others then
    assert sqlerrm = 'El estado de cobro no es válido', sqlerrm;
  end;
  raise notice 'OK listado: columna, filtro combinable y valor inválido';

  -- ============ Agenda de Recepción ============
  v_res := public.fn_consultar_agenda_profesional(v_prof, v_pasado);
  select jsonb_agg(e -> 'estado_cobro') into v_cobros
  from jsonb_array_elements(v_res) e
  where e ->> 'apellido_paciente' = 'TestHU17';
  assert jsonb_array_length(v_cobros) = 7;
  assert not (v_cobros @> '[null]'::jsonb), 'Recepción ve el estado de cobro en la agenda';
  raise notice 'OK agenda de Recepción con estado de cobro';

  -- ============ El Profesional no ve el estado de cobro ============
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;

  assert public.fn_obtener_turno(v_t_pagado) -> 'estado_cobro' = 'null'::jsonb, 'Profesional: detalle sin estado de cobro';
  v_res := public.fn_consultar_agenda_profesional(v_prof, v_pasado);
  assert not exists (
    select 1 from jsonb_array_elements(v_res) e where e -> 'estado_cobro' <> 'null'::jsonb
  ), 'Profesional: agenda sin estado de cobro';
  begin
    perform public.fn_buscar_turnos(null, null, null, null, null, null, 1, null);
    raise exception 'Un Profesional no debía listar turnos';
  exception when others then
    assert sqlerrm = 'No tenés permiso para consultar turnos', sqlerrm;
  end;
  raise notice 'OK el Profesional no ve el estado de cobro';

  reset role;
  assert not has_function_privilege('authenticated', 'public.fn_estado_cobro(text, boolean, boolean)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.fn_buscar_turnos(text, uuid, uuid, date, date, text, integer, text)', 'EXECUTE');
  -- No quedan dos versiones de fn_buscar_turnos.
  assert (select count(*) from pg_proc where proname = 'fn_buscar_turnos'
          and pronamespace = 'public'::regnamespace) = 1, 'Una sola fn_buscar_turnos';
  raise notice 'OK permisos y una sola versión de fn_buscar_turnos';
end;
$$;

rollback;
select 'HU-17: pruebas SQL correctas; datos de prueba revertidos' as resultado;
