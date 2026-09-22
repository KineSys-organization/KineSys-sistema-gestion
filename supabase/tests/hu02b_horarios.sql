-- Ejecutar DESPUÉS de 002_hu02b_franjas_profesional.sql.
-- Usa un profesional ficticio dentro de una transacción; ROLLBACK no conserva datos.
begin;
create temporary table hu02b_resultados (caso text);
alter table hu02b_resultados enable row level security;
create function pg_temp.esperar_error(p_sql text, p_mensaje text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_mensaje in sqlerrm) = 0 then raise; end if;
    insert into hu02b_resultados values (p_mensaje);
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
begin
  select id_usuario into v_gerente from public.usuario
    where activo and rol_usuario = 'Gerente' limit 1;
  select id_servicio into v_serv from public.servicio where activo limit 1;
  if v_gerente is null or v_serv is null then
    raise exception 'Las pruebas necesitan un Gerente activo y un servicio existente';
  end if;
  select n into v_dni from generate_series(2100000000, 2100000100) n
    where not exists (select 1 from public.usuario where dni_usuario = n) limit 1;

  insert into auth.users (id, email) values (v_prof, v_prof::text || '@hu02b.invalid');
  insert into public.usuario (
    id_usuario, nombre_usuario, apellido_usuario, fecha_nacimiento_usuario,
    dni_usuario, telefono_usuario, mail_usuario, rol_usuario, activo
  ) values (v_prof, 'Prueba HU02B', 'Temporal', '2000-01-01', v_dni, '0000000000',
    v_prof::text || '@hu02b.invalid', 'Profesional', true);
  insert into public.profesional (id_usuario, matricula, activo)
    values (v_prof, 'TEST-' || v_prof::text, true);

  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  v_datos := public.fn_consultar_horarios_profesional(v_prof);
  assert v_datos->'franjas' = '[]'::jsonb, 'Debe devolver una lista vacía';
  assert (v_datos->>'habilitado_turnos')::boolean = false;
  insert into hu02b_resultados values ('Consulta sin horarios');
  perform pg_temp.esperar_error(
    format('select public.fn_registrar_franja_profesional(%L, 1, %L, %L)', v_prof, '09:00', '12:00'),
    'al menos un servicio');
  insert into public.servicio_profesional (id_usuario, id_servicio) values (v_prof, v_serv);

  perform public.fn_registrar_franja_profesional(v_prof, 1, '09:00', '12:00');
  perform public.fn_registrar_franja_profesional(v_prof, 1, '16:00', '19:00');
  perform public.fn_registrar_franja_profesional(v_prof, 1, '12:00', '13:00');
  perform public.fn_registrar_franja_profesional(v_prof, 2, '09:00', '12:00');
  v_datos := public.fn_consultar_horarios_profesional(v_prof);
  assert jsonb_array_length(v_datos->'franjas') = 4;
  assert (v_datos->>'habilitado_turnos')::boolean = true;
  assert v_datos->'franjas'->1->>'hora_inicio' = '12:00:00', 'Orden por día/hora';
  insert into hu02b_resultados values ('Mañana/tarde, contigüidad, días distintos, orden y habilitación');

  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 3, %L, %L)', v_prof, '12:00', '12:00'), 'posterior');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 3, %L, %L)', v_prof, '12:00', '09:00'), 'posterior');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 1, %L, %L)', v_prof, '11:00', '14:00'), 'superpone');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 1, %L, %L)', v_prof, '09:00', '12:00'), 'superpone');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 1, %L, %L)', v_prof, '08:00', '20:00'), 'superpone');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 1, %L, %L)', v_prof, '10:00', '11:00'), 'superpone');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 0, %L, %L)', v_prof, '09:00', '12:00'), 'día');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 8, %L, %L)', v_prof, '09:00', '12:00'), 'día');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 3, null, %L)', v_prof, '12:00'), 'posterior');
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 3, %L, %L)', gen_random_uuid(), '09:00', '12:00'), 'no existe');

  perform set_config('request.jwt.claim.sub', v_prof::text, true);
  perform pg_temp.esperar_error(format('select public.fn_registrar_franja_profesional(%L, 3, %L, %L)', v_prof, '09:00', '12:00'), 'Solo el Gerente');
  perform pg_temp.esperar_error(format('select public.fn_consultar_horarios_profesional(%L)', v_prof), 'Solo el Gerente');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.esperar_error(format('select public.fn_consultar_horarios_profesional(%L)', v_prof), 'Solo el Gerente');

  assert not has_table_privilege('authenticated', 'public.franja_profesional', 'INSERT');
  assert not has_table_privilege('anon', 'public.franja_profesional', 'SELECT');
  assert not has_function_privilege('anon', 'public.fn_consultar_horarios_profesional(uuid)', 'EXECUTE');
  insert into hu02b_resultados values ('Sin acceso directo a la tabla ni RPC anónima');
end;
$$;
select * from hu02b_resultados;
rollback;
select 'HU-02B: pruebas SQL correctas; datos ficticios revertidos' as resultado;
