-- Pruebas HU-14 (registrar, corregir y listar pagos). Todo se revierte al final.
-- Requiere la migración 017_hu14_pagos.sql aplicada (y 014 para marcar ausente).
--
-- Simula los roles con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
-- Cuentas: Mesa de Entradas carlaperez@ y el primer Profesional activo.
-- Necesita un profesional activo con un servicio y una obra social activa en el catálogo.
begin;

do $$
declare
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_obra uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_pasado date := (timezone('America/Argentina/Buenos_Aires', now()))::date - 500;
  v_pac_particular uuid;
  v_pac_obra uuid;
  v_t_particular uuid; -- confirmado, particular
  v_t_obra uuid;       -- atendido, con obra social
  v_t_invalidos uuid;  -- confirmado, para probar importes inválidos
  v_t_cancelado uuid;  -- cancelado: no se cobra
  v_t_ausente uuid;    -- confirmado y pasado: se cobra y después se marca ausente
  v_res jsonb;
  v_id_pago uuid;
  v_cant integer;
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

  select o.id_obra_social into v_obra from public.obra_social o where o.activo = true limit 1;

  if v_mesa is null or v_prof is null or v_obra is null then
    raise exception 'Faltan datos de prueba (Mesa de Entradas, profesional con servicio u obra social)';
  end if;

  -- ============ Sesión de Mesa de Entradas: pacientes ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_pac_particular := public.fn_registrar_paciente(
    'Ana', 'TestHU14', 99140101, date '1990-05-10', '1100000141', 'ana.hu14.sql@test.com', '[]'::jsonb
  );
  v_pac_obra := public.fn_registrar_paciente(
    'Beto', 'TestHU14', 99140102, date '1985-03-02', '1100000142', 'beto.hu14.sql@test.com',
    jsonb_build_array(jsonb_build_object('id_obra_social', v_obra, 'numero_afiliado', 'AF-14'))
  );

  -- Turnos: se insertan directo (como postgres) en un día pasado y horas de madrugada,
  -- así no chocan con turnos reales ni dependen de las franjas.
  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac_particular, v_pasado, '01:00', '01:30', 'confirmado')
  returning id_turno into v_t_particular;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado,
    id_obra_social, numero_afiliado)
  values (v_prof, v_serv, v_pac_obra, v_pasado, '02:00', '02:30', 'atendido', v_obra, 'AF-14')
  returning id_turno into v_t_obra;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac_particular, v_pasado, '03:00', '03:30', 'confirmado')
  returning id_turno into v_t_invalidos;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac_particular, v_pasado, '04:00', '04:30', 'cancelado')
  returning id_turno into v_t_cancelado;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac_particular, v_pasado, '05:00', '05:30', 'confirmado')
  returning id_turno into v_t_ausente;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ============ Consultar sin pago ============
  v_res := public.fn_obtener_pago(v_t_particular);
  assert (v_res ->> 'cobrable')::boolean, 'Un turno confirmado sin pago se puede cobrar';
  assert v_res -> 'pago' = 'null'::jsonb, 'Todavía no hay pago';
  assert v_res -> 'turno' ? 'precio_servicio', 'Trae el precio del servicio como sugerencia';
  assert v_res -> 'turno' ->> 'cobertura' = 'Particular';
  raise notice 'OK consultar turno sin pago';

  -- ============ Registrar (particular) ============
  v_res := public.fn_registrar_pago(v_t_particular, 15000.50, 0, 'efectivo');
  assert (v_res -> 'pago' ->> 'importe_final')::numeric = 15000.50, 'Final = base sin descuento';
  assert v_res -> 'pago' ->> 'medio_pago' = 'efectivo';
  assert (v_res ->> 'cobrable')::boolean = false, 'Con pago ya no es cobrable';
  v_id_pago := (v_res -> 'pago' ->> 'id_pago')::uuid;
  raise notice 'OK registrar pago particular';

  -- Un solo pago por turno.
  begin
    perform public.fn_registrar_pago(v_t_particular, 100, 0, 'efectivo');
    raise exception 'Debía rechazar el segundo pago';
  exception when others then
    assert sqlerrm = 'Este turno ya tiene un pago registrado', sqlerrm;
  end;
  raise notice 'OK un solo pago por turno';

  -- Particular: sin descuento.
  begin
    perform public.fn_registrar_pago(v_t_invalidos, 1000, 100, 'efectivo');
    raise exception 'Debía rechazar el descuento en un turno particular';
  exception when others then
    assert sqlerrm like 'Solo se aplica descuento%', sqlerrm;
  end;

  -- ============ Registrar (obra social, turno atendido) ============
  v_res := public.fn_registrar_pago(v_t_obra, 20000, 5000, 'transferencia');
  assert (v_res -> 'pago' ->> 'importe_base')::numeric = 20000;
  assert (v_res -> 'pago' ->> 'descuento')::numeric = 5000;
  assert (v_res -> 'pago' ->> 'importe_final')::numeric = 15000, 'Final = base - descuento';
  raise notice 'OK registrar pago con descuento de obra social (turno atendido)';

  -- ============ Importes y medio inválidos ============
  begin
    perform public.fn_registrar_pago(v_t_invalidos, 0, 0, 'efectivo');
    raise exception 'Debía rechazar importe 0';
  exception when others then
    assert sqlerrm = 'El importe base debe ser mayor que cero', sqlerrm;
  end;
  begin
    perform public.fn_registrar_pago(v_t_invalidos, -10, 0, 'efectivo');
    raise exception 'Debía rechazar importe negativo';
  exception when others then
    assert sqlerrm = 'El importe base debe ser mayor que cero', sqlerrm;
  end;
  begin
    perform public.fn_registrar_pago(v_t_invalidos, null, 0, 'efectivo');
    raise exception 'Debía exigir el importe base';
  exception when others then
    assert sqlerrm = 'Ingresá el importe base', sqlerrm;
  end;
  begin
    perform public.fn_registrar_pago(v_t_invalidos, 10.123, 0, 'efectivo');
    raise exception 'Debía rechazar más de dos decimales';
  exception when others then
    assert sqlerrm = 'Los importes admiten hasta dos decimales', sqlerrm;
  end;
  begin
    perform public.fn_registrar_pago(v_t_invalidos, 1000, 0, 'obra_social');
    raise exception 'Debía rechazar un medio fuera de la lista';
  exception when others then
    assert sqlerrm = 'Elegí un medio de pago válido', sqlerrm;
  end;
  begin
    perform public.fn_registrar_pago(v_t_invalidos, 1000, 0, null);
    raise exception 'Debía exigir el medio';
  exception when others then
    assert sqlerrm = 'Elegí un medio de pago válido', sqlerrm;
  end;
  -- Descuentos inválidos: se prueban con la corrección del turno con obra social
  -- (usa las mismas reglas que el alta, en fn_validar_importes_pago).
  begin
    perform public.fn_corregir_pago(v_t_obra, 20000, -1, 'transferencia', 'prueba');
    raise exception 'Debía rechazar descuento negativo';
  exception when others then
    assert sqlerrm = 'El descuento no puede ser negativo', sqlerrm;
  end;
  begin
    perform public.fn_corregir_pago(v_t_obra, 20000, 20000, 'transferencia', 'prueba');
    raise exception 'Debía rechazar final en cero';
  exception when others then
    assert sqlerrm = 'El descuento no puede dejar el importe final en cero o menos', sqlerrm;
  end;
  reset role;
  select count(*) into v_cant from public.pago where id_turno = v_t_invalidos;
  assert v_cant = 0, 'Los intentos inválidos no dejaron ningún pago';
  set local role authenticated;
  raise notice 'OK importes, descuentos y medio inválidos rechazados';

  -- ============ Estado del turno ============
  begin
    perform public.fn_registrar_pago(v_t_cancelado, 1000, 0, 'efectivo');
    raise exception 'Debía rechazar cobrar un turno cancelado';
  exception when others then
    assert sqlerrm = 'Solo se puede registrar el pago de un turno confirmado o atendido', sqlerrm;
  end;
  assert (public.fn_obtener_pago(v_t_cancelado) ->> 'cobrable')::boolean = false;

  -- Pagado y después marcado ausente (HU-10B): el pago se conserva.
  perform public.fn_registrar_pago(v_t_ausente, 8000, 0, 'debito');
  perform public.fn_marcar_ausente(v_t_ausente);
  v_res := public.fn_obtener_pago(v_t_ausente);
  assert v_res -> 'turno' ->> 'estado' = 'ausente';
  assert (v_res -> 'pago' ->> 'importe_final')::numeric = 8000, 'El pago sigue después de marcar ausente';
  raise notice 'OK no se cobra cancelado; marcar ausente conserva el pago';

  -- ============ Corregir ============
  begin
    perform public.fn_corregir_pago(v_t_particular, 14000, 0, 'credito', '   ');
    raise exception 'Debía exigir el motivo';
  exception when others then
    assert sqlerrm = 'Indicá el motivo de la corrección', sqlerrm;
  end;
  begin
    perform public.fn_corregir_pago(v_t_particular, 15000.50, 0, 'efectivo', 'sin cambios');
    raise exception 'Debía avisar que no hay cambios';
  exception when others then
    assert sqlerrm = 'No hay cambios para guardar', sqlerrm;
  end;
  begin
    perform public.fn_corregir_pago(v_t_invalidos, 1000, 0, 'efectivo', 'no tiene pago');
    raise exception 'Debía rechazar corregir un turno sin pago';
  exception when others then
    assert sqlerrm = 'Este turno todavía no tiene un pago registrado', sqlerrm;
  end;

  v_res := public.fn_corregir_pago(v_t_particular, 14000, 0, 'credito', 'Se cobró con tarjeta de crédito');
  assert (v_res -> 'pago' ->> 'id_pago')::uuid = v_id_pago, 'Es el mismo pago';
  assert (v_res -> 'pago' ->> 'importe_final')::numeric = 14000;
  assert v_res -> 'pago' ->> 'medio_pago' = 'credito';
  assert v_res -> 'pago' ->> 'corregido_en' is not null;
  assert jsonb_array_length(v_res -> 'correcciones') = 1, 'Queda una corrección en el historial';
  assert (v_res -> 'correcciones' -> 0 ->> 'importe_final_anterior')::numeric = 15000.50;
  assert v_res -> 'correcciones' -> 0 ->> 'medio_pago_anterior' = 'efectivo';
  assert (v_res -> 'correcciones' -> 0 ->> 'importe_final_nuevo')::numeric = 14000;
  assert v_res -> 'correcciones' -> 0 ->> 'motivo' = 'Se cobró con tarjeta de crédito';
  assert v_res -> 'correcciones' -> 0 ->> 'corregido_por' is not null;
  raise notice 'OK corregir: mismo pago, historial con valores anteriores y nuevos';

  -- ============ Listado ============
  v_res := public.fn_listar_pagos('TestHU14', null, null, 1);
  assert (v_res ->> 'total')::integer = 3, 'Tres pagos de los pacientes de prueba';
  assert v_res -> 'pagos' -> 0 ? 'importe_final';
  assert v_res -> 'pagos' -> 0 ? 'medio_pago';
  assert v_res -> 'pagos' -> 0 ? 'fecha_turno';

  v_res := public.fn_listar_pagos('beto testhu14', null, null, 1);
  assert (v_res ->> 'total')::integer = 1, 'Filtra por nombre y apellido';

  v_res := public.fn_listar_pagos('99140102', null, null, 1);
  assert (v_res ->> 'total')::integer = 1, 'Filtra por DNI';

  -- Período = fecha del pago (hoy), no la fecha del turno (hace 500 días).
  v_res := public.fn_listar_pagos('TestHU14', v_hoy, v_hoy, 1);
  assert (v_res ->> 'total')::integer = 3, 'Los pagos se registraron hoy';
  v_res := public.fn_listar_pagos('TestHU14', v_pasado, v_pasado, 1);
  assert (v_res ->> 'total')::integer = 0, 'La fecha del turno no cuenta para el período';
  assert v_res -> 'pagos' = '[]'::jsonb;

  begin
    perform public.fn_listar_pagos(null, v_hoy, v_hoy - 1, 1);
    raise exception 'Debía rechazar Hasta anterior a Desde';
  exception when others then
    assert sqlerrm = 'La fecha Hasta no puede ser anterior a Desde', sqlerrm;
  end;
  raise notice 'OK listado: paciente, período de fecha de pago y rango inválido';

  -- ============ Permisos ============
  reset role;
  select u.id_usuario into v_prof from public.usuario u
  where u.rol_usuario = 'Profesional' and u.activo = true limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform public.fn_listar_pagos(null, null, null, 1);
    raise exception 'Un Profesional no debía listar pagos';
  exception when others then
    assert sqlerrm = 'No tenés permisos para realizar esta acción', sqlerrm;
  end;
  begin
    perform public.fn_obtener_pago(v_t_particular);
    raise exception 'Un Profesional no debía ver pagos';
  exception when others then
    assert sqlerrm = 'No tenés permisos para realizar esta acción', sqlerrm;
  end;

  reset role;
  assert not has_table_privilege('authenticated', 'public.pago', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.pago_correccion', 'SELECT');
  assert not has_function_privilege('anon', 'public.fn_registrar_pago(uuid, numeric, numeric, text)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.fn_validar_importes_pago(numeric, numeric, text, boolean)', 'EXECUTE');
  raise notice 'OK permisos: solo Recepción y Gerente, sin acceso directo a las tablas';
end;
$$;

rollback;
select 'HU-14: pruebas SQL correctas; datos de prueba revertidos' as resultado;
