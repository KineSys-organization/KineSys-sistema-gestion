-- Pruebas HU-35 (comprobante de pago). Todo se revierte al final.
-- Requiere las migraciones 017 (pagos), 023 (reembolso), 024 (estado de cobro) y 025 aplicadas.
--
-- Simula los roles con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
-- Cuentas: Mesa de Entradas carlaperez@ y el primer Profesional activo con un servicio.
begin;

do $$
declare
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_obra uuid;
  v_pasado date := (timezone('America/Argentina/Buenos_Aires', now()))::date - 540;
  v_pac uuid;
  v_pac_obra uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_t3 uuid;          -- pago con billetera virtual (HU-21)
  v_pago3 uuid;
  v_n3 bigint;
  v_operacion text := 'HU35' || upper(substr(md5(random()::text), 1, 10)); -- único
  v_pago1 uuid;
  v_pago2 uuid;
  v_n1 bigint;
  v_n2 bigint;
  v_res jsonb;
  v_comp jsonb;
begin
  -- ============ Numeración de los pagos existentes (migración) ============
  assert not exists (select 1 from public.pago where numero_comprobante is null),
    'Todos los pagos existentes tienen número';
  assert (select count(*) = count(distinct numero_comprobante) from public.pago),
    'Los números no se repiten';
  raise notice 'OK pagos existentes numerados y sin repetir';

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

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pac := public.fn_registrar_paciente(
    'Ana', 'TestHU35', 99350101, date '1990-05-10', '1100000351', 'ana.hu35.sql@test.com', '[]'::jsonb
  );
  v_pac_obra := public.fn_registrar_paciente(
    'Beto', 'TestHU35', 99350102, date '1985-03-02', '1100000352', 'beto.hu35.sql@test.com',
    jsonb_build_array(jsonb_build_object('id_obra_social', v_obra, 'numero_afiliado', 'AF-35'))
  );

  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, '01:00', '01:30', 'atendido') returning id_turno into v_t1;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado,
    id_obra_social, numero_afiliado)
  values (v_prof, v_serv, v_pac_obra, v_pasado, '02:00', '02:30', 'confirmado', v_obra, 'AF-35')
  returning id_turno into v_t2;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_pasado, '03:00', '03:30', 'confirmado') returning id_turno into v_t3;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ============ Registrar asigna el número siguiente ============
  v_res := public.fn_registrar_pago(v_t1, 12345.67, 0, 'efectivo');
  v_pago1 := (v_res -> 'pago' ->> 'id_pago')::uuid;
  v_n1 := (v_res -> 'pago' ->> 'numero_comprobante')::bigint;

  v_res := public.fn_registrar_pago(v_t2, 20000, 5000, 'transferencia');
  v_pago2 := (v_res -> 'pago' ->> 'id_pago')::uuid;
  v_n2 := (v_res -> 'pago' ->> 'numero_comprobante')::bigint;

  assert v_n1 is not null and v_n2 is not null, 'fn_obtener_pago devuelve el número';
  assert v_n2 > v_n1, 'Un pago posterior tiene un número mayor';
  raise notice 'OK registrar asigna el número (n1 = %, n2 = %)', v_n1, v_n2;

  -- ============ Datos del comprobante ============
  v_comp := public.fn_obtener_comprobante(v_pago1);
  assert (v_comp ->> 'numero_comprobante')::bigint = v_n1;
  assert v_comp ->> 'emitido_en' is not null, 'Fecha de emisión = registro del pago';
  assert v_comp -> 'paciente' ->> 'apellido' = 'TestHU35';
  assert v_comp -> 'paciente' ->> 'dni' = '99350101';
  assert v_comp -> 'turno' ->> 'hora_inicio' = '01:00';
  assert v_comp -> 'turno' ->> 'estado' = 'atendido';
  assert v_comp -> 'turno' ->> 'nombre_servicio' is not null;
  assert v_comp ->> 'cobertura' = 'Particular';
  assert (v_comp ->> 'importe_final')::numeric = 12345.67;
  assert v_comp ->> 'medio_pago' = 'efectivo';
  assert v_comp ->> 'estado_cobro' = 'pagado';
  assert v_comp ->> 'registrado_por' is not null, 'Usuario que registró el cobro';
  assert v_comp -> 'reembolso' = 'null'::jsonb;

  v_comp := public.fn_obtener_comprobante(v_pago2);
  assert v_comp ->> 'cobertura' <> 'Particular' and v_comp ->> 'numero_afiliado' = 'AF-35', 'Obra social y afiliado';
  assert (v_comp ->> 'descuento')::numeric = 5000 and (v_comp ->> 'importe_final')::numeric = 15000;
  raise notice 'OK datos del comprobante (particular y con obra social)';

  -- ============ Corregir no cambia el número ============
  perform public.fn_corregir_pago(v_t1, 12000, 0, 'debito', 'Se cobró con débito');
  v_comp := public.fn_obtener_comprobante(v_pago1);
  assert (v_comp ->> 'numero_comprobante')::bigint = v_n1, 'Mismo número después de corregir';
  assert (v_comp ->> 'importe_final')::numeric = 12000, 'Datos vigentes';
  assert v_comp ->> 'medio_pago' = 'debito';
  assert v_comp ->> 'corregido_en' is not null, 'Leyenda Corregido el…';
  raise notice 'OK corregir mantiene el número y muestra los datos vigentes';

  -- ============ Reembolsado ============
  perform public.fn_registrar_reembolso(v_t2, 'pedido_paciente', null, null);
  v_comp := public.fn_obtener_comprobante(v_pago2);
  assert v_comp ->> 'estado_cobro' = 'reembolsado';
  assert (v_comp -> 'reembolso' ->> 'importe')::numeric = 15000;
  assert v_comp -> 'reembolso' ->> 'registrado_en' is not null;
  assert (v_comp ->> 'numero_comprobante')::bigint = v_n2, 'El reembolso no cambia el número';
  raise notice 'OK comprobante de un pago reembolsado';

  -- ============ Billetera virtual (HU-21, migración 029) ============
  v_res := public.fn_registrar_pago(
    p_id_turno => v_t3, p_importe_base => 9000, p_descuento => 0,
    p_medio => 'billetera', p_numero_operacion => v_operacion
  );
  v_pago3 := (v_res -> 'pago' ->> 'id_pago')::uuid;
  v_n3 := (v_res -> 'pago' ->> 'numero_comprobante')::bigint;
  assert v_n3 > v_n2, 'El pago con billetera también recibe número';
  assert v_res -> 'pago' ->> 'numero_operacion' = v_operacion, 'fn_obtener_pago trae los dos números';

  v_comp := public.fn_obtener_comprobante(v_pago3);
  assert v_comp ->> 'medio_pago' = 'billetera';
  assert v_comp ->> 'numero_operacion' = v_operacion, 'El comprobante muestra el nº de operación';
  assert public.fn_obtener_comprobante(v_pago1) ->> 'numero_operacion' is null, 'Sin billetera, sin nº';

  -- Búsqueda combinada: medio + nº de comprobante (una sola fn_listar_pagos).
  assert (public.fn_listar_pagos(p_medio => 'billetera', p_numero_comprobante => v_n3) ->> 'total')::integer = 1;
  assert (public.fn_listar_pagos(p_medio => 'efectivo', p_numero_comprobante => v_n3) ->> 'total')::integer = 0;
  raise notice 'OK billetera: nº de operación en el comprobante y búsqueda combinada';

  -- ============ Sin pago no hay comprobante ============
  begin
    perform public.fn_obtener_comprobante(gen_random_uuid());
    raise exception 'Debía rechazar un comprobante inexistente';
  exception when others then
    assert sqlerrm = 'El comprobante no existe', sqlerrm;
  end;
  raise notice 'OK no hay comprobantes en blanco';

  -- ============ Listado: número y búsqueda ============
  v_res := public.fn_listar_pagos(p_pagina => 1, p_numero_comprobante => v_n1);
  assert (v_res ->> 'total')::integer = 1, 'Busca por número';
  assert (v_res -> 'pagos' -> 0 ->> 'numero_comprobante')::bigint = v_n1;
  -- Combinable con paciente: otro paciente → 0.
  v_res := public.fn_listar_pagos(p_texto => 'Beto', p_pagina => 1, p_numero_comprobante => v_n1);
  assert (v_res ->> 'total')::integer = 0;
  -- Combinable con reembolso: el n2 está reembolsado.
  assert (public.fn_listar_pagos(p_pagina => 1, p_reembolso => 'con', p_numero_comprobante => v_n2) ->> 'total')::integer = 1;
  assert (public.fn_listar_pagos(p_pagina => 1, p_reembolso => 'sin', p_numero_comprobante => v_n2) ->> 'total')::integer = 0;
  begin
    perform public.fn_listar_pagos(p_pagina => 1, p_numero_comprobante => 0);
    raise exception 'Debía rechazar el número 0';
  exception when others then
    assert sqlerrm = 'El número de comprobante no es válido', sqlerrm;
  end;
  raise notice 'OK listado: número de comprobante y búsqueda combinable';

  -- ============ Permisos ============
  reset role;
  select u.id_usuario into v_prof from public.usuario u
  where u.rol_usuario = 'Profesional' and u.activo = true limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.fn_obtener_comprobante(v_pago1);
    raise exception 'Un Profesional no debía ver comprobantes';
  exception when others then
    assert sqlerrm = 'No tenés permisos para realizar esta acción', sqlerrm;
  end;

  reset role;
  assert not has_sequence_privilege('authenticated', 'public.pago_numero_comprobante_seq', 'USAGE');
  assert not has_function_privilege('anon', 'public.fn_obtener_comprobante(uuid)', 'EXECUTE');
  assert (select count(*) from pg_proc where proname = 'fn_listar_pagos'
          and pronamespace = 'public'::regnamespace) = 1, 'Una sola fn_listar_pagos';
  raise notice 'OK permisos y una sola versión de fn_listar_pagos';
end;
$$;

rollback;
select 'HU-35: pruebas SQL correctas; datos de prueba revertidos' as resultado;
