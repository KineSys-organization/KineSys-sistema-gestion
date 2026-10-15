-- Pruebas HU-16: historial completo del paciente (vista administrativa y clínica).
-- Requiere 033_hu16_historial_paciente.sql. Todo se revierte al final.
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_prof uuid;
  v_otro_prof uuid;
  v_servicio uuid;
  v_paciente uuid;
  v_fecha date := '2099-08-04'::date; -- martes
  v_res jsonb;
  v_turno uuid;
  v_pago uuid;
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';

  select u.id_usuario into v_prof
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo and p.activo
  order by u.mail_usuario
  limit 1;

  select u.id_usuario into v_otro_prof
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.id_usuario <> v_prof
  order by u.mail_usuario
  limit 1;

  select id_servicio into v_servicio from public.servicio where activo limit 1;

  if v_gerente is null or v_mesa is null or v_prof is null or v_otro_prof is null or v_servicio is null then
    raise exception 'Faltan datos de prueba (Gerente, Mesa, dos profesionales o servicio)';
  end if;

  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente)
  values ('HU16', 'Historial', floor(random() * 10000000)::bigint + 50000000)
  returning id_paciente into v_paciente;

  -- Paciente sin turnos.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := public.fn_consultar_historial_paciente(v_paciente, null, null, null, 1);
  if (v_res -> 'resumen' ->> 'total')::int <> 0
     or jsonb_array_length(v_res -> 'turnos') <> 0 then
    raise exception 'FALLA: paciente sin turnos: %', v_res;
  end if;

  -- Cuatro turnos: confirmado, atendido (con atención y orden), cancelado, ausente.
  -- El atendido es de otro profesional; el resto del principal.
  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_servicio, v_paciente, v_fecha, '09:00', '09:30', 'confirmado')
  returning id_turno into v_turno;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_otro_prof, v_servicio, v_paciente, v_fecha, '10:00', '10:30', 'atendido');

  insert into public.atencion (id_turno, id_profesional, id_paciente, fecha_atencion, observaciones, motivo_consulta, orden_medica)
  select t.id_turno, t.id_profesional, t.id_paciente, t.fecha, 'Evolución HU16', 'Dolor', 'Orden HU16'
  from public.turno t
  where t.id_paciente = v_paciente and t.estado = 'atendido';

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion)
  values (v_prof, v_servicio, v_paciente, v_fecha, '11:00', '11:30', 'cancelado', 'pedido_paciente');

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_servicio, v_paciente, v_fecha, '12:00', '12:30', 'ausente');

  -- Pago + reembolso sobre el confirmado.
  insert into public.pago (id_turno, id_paciente, importe_base, descuento, importe_final, medio_pago, registrado_por)
  values (v_turno, v_paciente, 1000, 0, 1000, 'efectivo', v_gerente)
  returning id_pago into v_pago;
  insert into public.reembolso (id_pago, importe, medio_devolucion, motivo, registrado_por)
  values (v_pago, 1000, 'efectivo', 'pedido_paciente', v_gerente);

  -- Gerente: resumen, cobro, orden, sin atención clínica.
  set local role authenticated;
  v_res := public.fn_consultar_historial_paciente(v_paciente, null, null, null, 1);
  if v_res ->> 'vista' <> 'administrativa'
     or (v_res -> 'resumen' ->> 'total')::int <> 4
     or (v_res -> 'resumen' ->> 'atendidos')::int <> 1
     or (v_res -> 'resumen' ->> 'cancelados')::int <> 1
     or (v_res -> 'resumen' ->> 'ausentes')::int <> 1 then
    raise exception 'FALLA: resumen Gerente: %', v_res -> 'resumen';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_res -> 'turnos') t
    where t -> 'atencion' is not null and t -> 'atencion' <> 'null'::jsonb
  ) then
    raise exception 'FALLA: Gerente vio atención clínica: %', v_res -> 'turnos';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_res -> 'turnos') t
    where t ->> 'id_turno' = v_turno::text
      and t ->> 'estado_cobro' = 'reembolsado'
      and (t ->> 'importe_final')::numeric = 1000
      and t ->> 'medio_pago' = 'efectivo'
  ) then
    raise exception 'FALLA: Gerente no ve el reembolso: %', v_res -> 'turnos';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_res -> 'turnos') t
    where t ->> 'estado' = 'atendido' and (t ->> 'tiene_orden_medica')::boolean
  ) then
    raise exception 'FALLA: Gerente no ve la orden médica: %', v_res -> 'turnos';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_res -> 'turnos') t
    where t ->> 'estado' = 'cancelado' and t ->> 'motivo_cancelacion' = 'pedido_paciente'
  ) then
    raise exception 'FALLA: cancelado sin motivo: %', v_res -> 'turnos';
  end if;

  -- Mesa: ve cobro, no ve órdenes.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  v_res := public.fn_consultar_historial_paciente(v_paciente, null, null, null, 1);
  if exists (
    select 1 from jsonb_array_elements(v_res -> 'turnos') t
    where t -> 'tiene_orden_medica' is not null and t -> 'tiene_orden_medica' <> 'null'::jsonb
  ) then
    raise exception 'FALLA: Mesa vio tiene_orden_medica: %', v_res -> 'turnos';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_res -> 'turnos') t
    where t ->> 'estado_cobro' = 'reembolsado'
  ) then
    raise exception 'FALLA: Mesa no ve cobro: %', v_res -> 'turnos';
  end if;

  -- Filtro por profesional: solo los del principal (3).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  v_res := public.fn_consultar_historial_paciente(v_paciente, null, null, v_prof, 1);
  if (v_res -> 'resumen' ->> 'total')::int <> 3 then
    raise exception 'FALLA: filtro profesional: %', v_res -> 'resumen';
  end if;

  -- Filtros sin resultados.
  v_res := public.fn_consultar_historial_paciente(v_paciente, '2099-01-01', '2099-01-02', null, 1);
  if (v_res -> 'resumen' ->> 'total')::int <> 0 then
    raise exception 'FALLA: rango vacío: %', v_res;
  end if;

  -- Profesional con turnos: ve atención, no ve cobro.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  v_res := public.fn_consultar_historial_paciente(v_paciente, null, null, null, 1);
  if v_res ->> 'vista' <> 'clinica'
     or (v_res -> 'resumen' ->> 'total')::int <> 4 then
    raise exception 'FALLA: vista clínica: %', v_res;
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_res -> 'turnos') t
    where t ->> 'estado_cobro' is not null
       or t ->> 'importe_final' is not null
  ) then
    raise exception 'FALLA: Profesional vio pagos: %', v_res -> 'turnos';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_res -> 'turnos') t
    where t ->> 'estado' = 'atendido'
      and t -> 'atencion' ->> 'observaciones' = 'Evolución HU16'
      and t -> 'atencion' ->> 'orden_medica' = 'Orden HU16'
  ) then
    raise exception 'FALLA: Profesional no ve la atención: %', v_res -> 'turnos';
  end if;

  -- Profesional sin turnos con el paciente.
  begin
    perform public.fn_consultar_historial_paciente(gen_random_uuid(), null, null, null, 1);
    raise exception 'FALLA: profesional sin turnos consultó el historial';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%turnos con este paciente%' then raise; end if;
  end;

  -- Rango inválido.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_consultar_historial_paciente(v_paciente, '2099-08-10', '2099-08-01', null, 1);
    raise exception 'FALLA: aceptó desde > hasta';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%no puede ser posterior%' then raise; end if;
  end;

  raise notice 'HU-16: todas las pruebas pasaron';
end;
$$;

rollback;
