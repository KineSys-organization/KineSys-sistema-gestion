-- Pruebas HU-19 (indicadores económicos). Todo se revierte al final.
-- Requiere 017 (pagos), 023 (reembolso), 024 (estado de cobro), 028 (billetera) y 030 aplicadas.
--
-- Usa fechas de 2020 para no mezclarse con los datos reales. Período probado: marzo 2020
-- (31 días) → período anterior: 30/01/2020 al 29/02/2020.
--
--   Pagos de marzo (por fecha del pago, hora AR):
--     p1  efectivo       10.000  particular        (después se reembolsa el 25/03)
--     p2  transferencia  15.000  obra social (base 20.000 - descuento 5.000)
--     p3  débito 8.000 corregido a crédito 9.000   (cuenta el importe vigente)
--     p4  billetera       4.000  registrado el 31/03 23:30 AR (= 01/04 en UTC: cuenta en marzo)
--   Fuera del período: p5 el 02/04 (5.000) y p6 el 15/02 (6.000, período anterior).
--   Reembolsos registrados en marzo: el de p1 (10.000) y el de p6 (6.000): restan en marzo,
--   aunque el pago de p6 sea de febrero.
--
--   Esperado marzo: brutos 38.000 · 4 pagos · promedio 9.500 · reembolsos 16.000 · netos 22.000.
--   Anterior: netos 6.000 → variación +16.000 (266,7 %).
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_obra uuid;
  v_pac uuid;
  v_pac_obra uuid;
  v_t uuid[] := array[]::uuid[];
  v_id uuid;
  v_pago_p1 uuid;
  v_pago_p3 uuid;
  v_pago_p6 uuid;
  v_res jsonb;
  v_medio jsonb;
  v_mes jsonb;
  v_operacion text := 'HU19' || upper(substr(md5(random()::text), 1, 10));
  i integer;
begin
  -- ============ Datos de base (como postgres) ============
  select id_usuario into v_gerente from public.usuario
  where rol_usuario = 'Gerente' and activo = true order by mail_usuario limit 1;
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select p.id_usuario, sp.id_servicio into v_prof, v_serv
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo = true
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  where p.activo = true
  order by u.mail_usuario
  limit 1;
  select o.id_obra_social into v_obra from public.obra_social o where o.activo = true limit 1;

  if v_gerente is null or v_mesa is null or v_prof is null or v_obra is null then
    raise exception 'Faltan datos de prueba (Gerente, Mesa de Entradas, profesional con servicio u obra social)';
  end if;

  -- Pacientes de prueba (como Mesa de Entradas, igual que las otras pruebas).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pac := public.fn_registrar_paciente(
    'Ana', 'TestHU19', 99190101, date '1990-05-10', '1100000191', 'ana.hu19.sql@test.com', '[]'::jsonb
  );
  v_pac_obra := public.fn_registrar_paciente(
    'Beto', 'TestHU19', 99190102, date '1985-03-02', '1100000192', 'beto.hu19.sql@test.com',
    jsonb_build_array(jsonb_build_object('id_obra_social', v_obra, 'numero_afiliado', 'AF-19'))
  );
  reset role;

  -- Turnos atendidos (los que se cobran). El 2 tiene obra social; el 6 es de febrero.
  for i in 1..6 loop
    insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin,
      estado, id_obra_social, numero_afiliado)
    values (
      v_prof, v_serv, case when i = 2 then v_pac_obra else v_pac end,
      case when i = 6 then date '2020-02-14' when i = 5 then date '2020-04-01' else date '2020-03-02' end,
      make_time(i, 0, 0), make_time(i, 30, 0), 'atendido',
      case when i = 2 then v_obra end, case when i = 2 then 'AF-19' end
    )
    returning id_turno into v_id;
    v_t := v_t || v_id;
  end loop;

  -- Pendiente de cobro (confirmado sin pago) y cancelado sin pago, los dos en marzo.
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, '2020-03-03', '07:00', '07:30', 'confirmado');
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado,
    motivo_cancelacion)
  values (v_prof, v_serv, v_pac, '2020-03-03', '08:00', '08:30', 'cancelado', 'otro');

  -- Pagos (insert directo con la fecha de registro que necesita la prueba).
  insert into public.pago (id_turno, id_paciente, importe_base, descuento, importe_final, medio_pago,
    registrado_en, registrado_por)
  values (v_t[1], v_pac, 10000, 0, 10000, 'efectivo', '2020-03-05 12:00-03', v_gerente)
  returning id_pago into v_pago_p1;

  insert into public.pago (id_turno, id_paciente, importe_base, descuento, importe_final, medio_pago,
    registrado_en, registrado_por)
  values (v_t[2], v_pac_obra, 20000, 5000, 15000, 'transferencia', '2020-03-10 12:00-03', v_gerente);

  insert into public.pago (id_turno, id_paciente, importe_base, descuento, importe_final, medio_pago,
    registrado_en, registrado_por)
  values (v_t[3], v_pac, 8000, 0, 8000, 'debito', '2020-03-12 12:00-03', v_gerente)
  returning id_pago into v_pago_p3;
  -- Corrección (HU-14): queda el importe vigente.
  update public.pago set importe_base = 9000, importe_final = 9000, medio_pago = 'credito',
    corregido_en = '2020-03-13 12:00-03'
  where id_pago = v_pago_p3;

  insert into public.pago (id_turno, id_paciente, importe_base, descuento, importe_final, medio_pago,
    numero_operacion, registrado_en, registrado_por)
  values (v_t[4], v_pac, 4000, 0, 4000, 'billetera', v_operacion, '2020-03-31 23:30-03', v_gerente);

  insert into public.pago (id_turno, id_paciente, importe_base, descuento, importe_final, medio_pago,
    registrado_en, registrado_por)
  values (v_t[5], v_pac, 5000, 0, 5000, 'efectivo', '2020-04-02 12:00-03', v_gerente);

  insert into public.pago (id_turno, id_paciente, importe_base, descuento, importe_final, medio_pago,
    registrado_en, registrado_por)
  values (v_t[6], v_pac, 6000, 0, 6000, 'efectivo', '2020-02-15 12:00-03', v_gerente)
  returning id_pago into v_pago_p6;

  -- Reembolsos registrados en marzo (uno de un pago de febrero).
  insert into public.reembolso (id_pago, importe, medio_devolucion, motivo, registrado_en, registrado_por)
  values (v_pago_p1, 10000, 'efectivo', 'pedido_paciente', '2020-03-25 12:00-03', v_gerente);
  insert into public.reembolso (id_pago, importe, medio_devolucion, motivo, registrado_en, registrado_por)
  values (v_pago_p6, 6000, 'efectivo', 'turno_cancelado', '2020-03-15 12:00-03', v_gerente);

  -- ============ Sesión del Gerente ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_res := public.fn_consultar_indicadores_economicos('2020-03-01', '2020-03-31');

  -- Ingresos.
  assert (v_res -> 'ingresos' ->> 'brutos')::numeric = 38000, 'brutos: ' || (v_res -> 'ingresos' ->> 'brutos');
  assert (v_res -> 'ingresos' ->> 'cantidad_pagos')::integer = 4;
  assert (v_res -> 'ingresos' ->> 'promedio')::numeric = 9500;
  assert (v_res -> 'ingresos' ->> 'reembolsos')::numeric = 16000, 'reembolsos por fecha del reembolso';
  assert (v_res -> 'ingresos' ->> 'netos')::numeric = 22000;
  raise notice 'OK brutos (importe vigente, fecha del pago en hora AR), reembolsos y netos';

  -- Evolución contra el período anterior (30/01 al 29/02).
  assert v_res -> 'anterior' ->> 'desde' = '2020-01-30' and v_res -> 'anterior' ->> 'hasta' = '2020-02-29';
  assert (v_res -> 'evolucion' ->> 'netos_anterior')::numeric = 6000;
  assert (v_res -> 'evolucion' ->> 'variacion_pesos')::numeric = 16000;
  assert (v_res -> 'evolucion' ->> 'variacion_porcentaje')::numeric = 266.7;
  raise notice 'OK evolución contra el período anterior de igual duración';

  -- Por medio (los 5, incluidos los que no tuvieron pagos).
  assert jsonb_array_length(v_res -> 'por_medio') = 5;
  for v_medio in select * from jsonb_array_elements(v_res -> 'por_medio') loop
    case v_medio ->> 'medio'
      when 'efectivo' then assert (v_medio ->> 'importe')::numeric = 10000 and (v_medio ->> 'cantidad')::int = 1;
      when 'transferencia' then assert (v_medio ->> 'importe')::numeric = 15000;
      when 'debito' then assert (v_medio ->> 'importe')::numeric = 0 and (v_medio ->> 'cantidad')::int = 0, 'el corregido ya no es débito';
      when 'credito' then assert (v_medio ->> 'importe')::numeric = 9000;
      when 'billetera' then assert (v_medio ->> 'importe')::numeric = 4000;
    end case;
  end loop;
  raise notice 'OK desglose por medio (con billetera y con el corregido en su medio nuevo)';

  -- Particular frente a obra social.
  assert (v_res -> 'cobertura' ->> 'particular_importe')::numeric = 23000;
  assert (v_res -> 'cobertura' ->> 'particular_cantidad')::integer = 3;
  assert (v_res -> 'cobertura' ->> 'obra_social_importe')::numeric = 15000;
  assert (v_res -> 'cobertura' ->> 'descuentos')::numeric = 5000;
  raise notice 'OK particular / obra social y descuentos';

  -- Pendientes de cobro (HU-17): el confirmado sin pago; el cancelado no cuenta.
  assert (v_res ->> 'pendientes_cobro')::integer >= 1;
  raise notice 'OK pendientes de cobro';

  -- (Should) Últimos 6 meses: oct/2019 a mar/2020.
  assert jsonb_array_length(v_res -> 'meses') = 6;
  assert v_res -> 'meses' -> 0 ->> 'mes' = '2019-10' and v_res -> 'meses' -> 5 ->> 'mes' = '2020-03';
  assert (v_res -> 'meses' -> 5 ->> 'netos')::numeric = 22000;
  assert (v_res -> 'meses' -> 4 ->> 'netos')::numeric = 6000, 'febrero';
  raise notice 'OK últimos 6 meses';

  -- (Should) Por servicio y por profesional (todos los pagos de prueba, mismo servicio/profesional).
  assert exists (select 1 from jsonb_array_elements(v_res -> 'por_servicio') e
                 where (e ->> 'importe')::numeric = 38000 and (e ->> 'cantidad')::int = 4);
  assert exists (select 1 from jsonb_array_elements(v_res -> 'por_profesional') e
                 where (e ->> 'importe')::numeric = 38000 and (e ->> 'cantidad')::int = 4);
  raise notice 'OK desglose por servicio y por profesional';

  -- Período sin pagos: todo en 0 y sin comparación (anterior en 0).
  v_res := public.fn_consultar_indicadores_economicos('2020-06-01', '2020-06-30');
  assert (v_res -> 'ingresos' ->> 'brutos')::numeric = 0 and (v_res -> 'ingresos' ->> 'promedio')::numeric = 0;
  assert (v_res -> 'ingresos' ->> 'netos')::numeric = 0;
  assert v_res -> 'evolucion' -> 'variacion_porcentaje' = 'null'::jsonb, 'Sin datos para comparar';
  assert v_res -> 'por_servicio' = '[]'::jsonb;
  raise notice 'OK período sin pagos en 0 y sin dividir por cero';

  -- Validaciones.
  begin
    perform public.fn_consultar_indicadores_economicos('2020-03-31', '2020-03-01');
    raise exception 'Debía rechazar desde > hasta';
  exception when others then
    assert sqlerrm = 'La fecha desde no puede ser posterior a la fecha hasta', sqlerrm;
  end;
  begin
    perform public.fn_consultar_indicadores_economicos('2019-01-01', '2020-03-01');
    raise exception 'Debía rechazar más de un año';
  exception when others then
    assert sqlerrm = 'El período no puede superar un año', sqlerrm;
  end;

  -- Solo Gerente.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.fn_consultar_indicadores_economicos('2020-03-01', '2020-03-31');
    raise exception 'Mesa de Entradas no debía ver los indicadores económicos';
  exception when others then
    assert sqlerrm = 'No tenés permisos para realizar esta acción', sqlerrm;
  end;
  reset role;
  assert not has_function_privilege('anon', 'public.fn_consultar_indicadores_economicos(date, date)', 'EXECUTE');
  raise notice 'OK validaciones y solo Gerente';
end;
$$;

rollback;
select 'HU-19: pruebas SQL correctas; datos de prueba revertidos' as resultado;
