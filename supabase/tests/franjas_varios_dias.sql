-- Ejecutar DESPUÉS de 012_franjas_varios_dias.sql (en el SQL Editor de Supabase).
-- Usa un profesional ficticio dentro de una transacción; ROLLBACK no conserva datos.
begin;
create temporary table franjas_resultados (caso text);
alter table franjas_resultados enable row level security;
create function pg_temp.esperar_error(p_sql text, p_mensaje text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_mensaje in sqlerrm) = 0 then raise; end if;
    insert into franjas_resultados values (p_mensaje);
    return;
  end;
  raise exception 'La operación debía fallar: %', p_sql;
end;
$$;
do $$
declare
  v_gerente uuid;
  v_prof uuid := gen_random_uuid();
  v_serv uuid;
  v_dni integer;
  v_datos jsonb;
  v_cantidad integer;
begin
  select id_usuario into v_gerente from public.usuario
    where activo and rol_usuario = 'Gerente' limit 1;
  select id_servicio into v_serv from public.servicio where activo limit 1;
  if v_gerente is null or v_serv is null then
    raise exception 'Las pruebas necesitan un Gerente activo y un servicio existente';
  end if;
  select n into v_dni from generate_series(2100000200, 2100000300) n
    where not exists (select 1 from public.usuario where dni_usuario = n) limit 1;

  insert into auth.users (id, email) values (v_prof, v_prof::text || '@franjas.invalid');
  insert into public.usuario (
    id_usuario, nombre_usuario, apellido_usuario, fecha_nacimiento_usuario,
    dni_usuario, telefono_usuario, mail_usuario, rol_usuario, activo
  ) values (v_prof, 'Prueba', 'Franjas', '2000-01-01', v_dni, '0000000000',
    v_prof::text || '@franjas.invalid', 'Profesional', true);
  insert into public.profesional (id_usuario, matricula, activo)
    values (v_prof, 'TEST-' || v_prof::text, true);

  perform set_config('request.jwt.claim.sub', v_gerente::text, true);

  -- Sin servicios no se cargan franjas.
  perform pg_temp.esperar_error(
    format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{1,2}', '09:00', '12:00'),
    'al menos un servicio');
  insert into public.servicio_profesional (id_usuario, id_servicio) values (v_prof, v_serv);

  -- Lunes a viernes de 09 a 12: 5 franjas de una vez.
  v_datos := public.fn_registrar_franjas_profesional(v_prof, array[1, 2, 3, 4, 5], '09:00', '12:00');
  assert (v_datos->>'creadas')::integer = 5, 'Debe crear 5 franjas';
  select count(*) into v_cantidad from public.franja_profesional where id_usuario = v_prof;
  assert v_cantidad = 5;
  insert into franjas_resultados values ('Lunes a viernes 09 a 12: 5 franjas');

  -- Días repetidos y desordenados: se guardan una sola vez. Contiguo a 12:00 no choca.
  v_datos := public.fn_registrar_franjas_profesional(v_prof, array[4, 2, 2], '12:00', '14:00');
  assert (v_datos->>'creadas')::integer = 2, 'Martes y jueves, sin repetir';
  assert v_datos->'dias' = '[2, 4]'::jsonb, 'Ordenados';
  insert into franjas_resultados values ('Repetidos una vez, orden y contigüidad');

  -- Todo o nada: el miércoles choca, así que el sábado tampoco se guarda.
  perform pg_temp.esperar_error(
    format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{3,6}', '11:00', '13:00'),
    'El miércoles se superpone con la franja de 09:00 a 12:00');
  assert not exists (select 1 from public.franja_profesional where id_usuario = v_prof and dia_semana = 6),
    'No debe quedar guardado el sábado';
  select count(*) into v_cantidad from public.franja_profesional where id_usuario = v_prof;
  assert v_cantidad = 7, 'Siguen las 7 franjas de antes';
  insert into franjas_resultados values ('Todo o nada ante una superposición');

  -- Validaciones de parámetros.
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{}', '09:00', '12:00'), 'al menos un día');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, null, %L, %L)', v_prof, '09:00', '12:00'), 'al menos un día');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{6,8}', '09:00', '12:00'), 'día de la semana válido');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{0}', '09:00', '12:00'), 'día de la semana válido');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{6,NULL}', '09:00', '12:00'), 'día de la semana válido');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{6}', '12:00', '12:00'), 'posterior');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{6}', '12:00', '09:00'), 'posterior');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, null, %L)', v_prof, '{6}', '12:00'), 'posterior');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', gen_random_uuid(), '{6}', '09:00', '12:00'), 'no existe');

  -- Solo el Gerente (HU-08): un Profesional o alguien sin sesión no pueden.
  perform set_config('request.jwt.claim.sub', v_prof::text, true);
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{6}', '09:00', '12:00'), 'No tenés permisos');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.esperar_error(format('select public.fn_registrar_franjas_profesional(%L, %L, %L, %L)', v_prof, '{6}', '09:00', '12:00'), 'No autenticado');

  assert not has_function_privilege('anon', 'public.fn_registrar_franjas_profesional(uuid, integer[], time, time)', 'EXECUTE');
  assert has_function_privilege('authenticated', 'public.fn_registrar_franjas_profesional(uuid, integer[], time, time)', 'EXECUTE');
  insert into franjas_resultados values ('Solo Gerente y sin RPC anónima');
end;
$$;
select * from franjas_resultados;
rollback;
select 'Franjas en varios días: pruebas SQL correctas; datos ficticios revertidos' as resultado;
