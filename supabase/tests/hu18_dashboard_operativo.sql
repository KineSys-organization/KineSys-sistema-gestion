-- Pruebas HU-18. Todo se revierte al final.
-- Requiere la migración 20261013050518_hu18_dashboard_operativo.sql aplicada.
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_prof uuid;
  v_servicio uuid;
  v_paciente_nuevo uuid;
  v_paciente_recurrente uuid;
  v_fecha date;
  v_dia integer;
  v_franja uuid;
  v_resultado jsonb;
  v_profesional jsonb;
  v_servicio_resultado jsonb;
  v_id_nuevo bigint := floor(random() * 10000000)::bigint + 90000000;
  v_id_recurrente bigint := floor(random() * 10000000)::bigint + 80000000;
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select u.id_usuario into v_prof
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo = true and p.activo = true
  order by u.mail_usuario
  limit 1;
  select id_servicio into v_servicio from public.servicio where activo = true limit 1;

  if v_gerente is null or v_mesa is null or v_prof is null or v_servicio is null then
    raise exception 'Faltan datos de prueba (Gerente, Mesa, profesional activo o servicio activo)';
  end if;

  -- Elige un fin de semana de 2099 sin franja para este profesional.
  select d.fecha::date, extract(isodow from d.fecha)::integer
    into v_fecha, v_dia
  from generate_series('2099-03-01'::date, '2099-03-07'::date, interval '1 day') d(fecha)
  where extract(isodow from d.fecha)::integer in (6, 7)
    and not exists (
      select 1 from public.franja_profesional f
      where f.id_usuario = v_prof
        and f.dia_semana = extract(isodow from d.fecha)::integer
    )
  order by d.fecha
  limit 1;

  if v_fecha is null then
    raise exception 'El profesional de prueba debe tener libre al menos un sábado o domingo';
  end if;

  insert into public.franja_profesional (id_usuario, dia_semana, hora_inicio, hora_fin)
  values (v_prof, v_dia, '09:00', '11:00')
  returning id_franja into v_franja;

  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente, creado)
  values ('HU18', 'Nuevo', v_id_nuevo, (v_fecha + time '12:00') at time zone 'America/Argentina/Buenos_Aires')
  returning id_paciente into v_paciente_nuevo;

  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente, creado)
  values ('HU18', 'Recurrente', v_id_recurrente, (v_fecha - 1 + time '12:00') at time zone 'America/Argentina/Buenos_Aires')
  returning id_paciente into v_paciente_recurrente;

  -- Tres estados ocupan la franja; cancelado se cuenta, pero no ocupa minutos.
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion)
  values
    (v_prof, v_servicio, v_paciente_nuevo, v_fecha, '09:00', '09:30', 'confirmado', null),
    (v_prof, v_servicio, v_paciente_recurrente, v_fecha, '09:30', '10:00', 'atendido', null),
    (v_prof, v_servicio, v_paciente_recurrente, v_fecha, '10:00', '10:30', 'ausente', null),
    (v_prof, v_servicio, v_paciente_recurrente, v_fecha, '10:30', '11:00', 'cancelado', 'otro');

  -- Aísla el denominador del centro para comprobar la tasa exacta; todo se revierte.
  update public.profesional set activo = false where id_usuario <> v_prof;
  update public.usuario u set activo = false
  where exists (
    select 1 from public.profesional p
    where p.id_usuario = u.id_usuario and p.id_usuario <> v_prof
  );

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_resultado := public.fn_consultar_dashboard_operativo(v_fecha, v_fecha);
  if (v_resultado ->> 'pacientes_nuevos')::int <> 1
     or (v_resultado ->> 'pacientes_recurrentes')::int <> 1 then
    raise exception 'FALLA: nuevos y recurrentes: %', v_resultado;
  end if;

  select item into v_profesional
  from jsonb_array_elements(v_resultado -> 'profesionales') as filas(item)
  where item ->> 'id_profesional' = v_prof::text;
  if v_profesional is null
     or (v_profesional ->> 'total')::int <> 4
     or (v_profesional ->> 'confirmados')::int <> 1
     or (v_profesional ->> 'atendidos')::int <> 1
     or (v_profesional ->> 'ausentes')::int <> 1
     or (v_profesional ->> 'cancelados')::int <> 1
     or (v_profesional ->> 'minutos_ocupados')::int <> 90
     or (v_profesional ->> 'minutos_disponibles')::int <> 120
     or (v_profesional ->> 'porcentaje_ocupacion')::numeric <> 75 then
    raise exception 'FALLA: turnos y ocupación del profesional: %', v_profesional;
  end if;
  if (v_resultado #>> '{ocupacion_centro,porcentaje}')::numeric <> 75
     or (v_resultado #>> '{ocupacion_centro,minutos_ocupados}')::int <> 90
     or (v_resultado #>> '{ocupacion_centro,minutos_disponibles}')::int <> 120 then
    raise exception 'FALLA: ocupación del centro: %', v_resultado -> 'ocupacion_centro';
  end if;

  select item into v_servicio_resultado
  from jsonb_array_elements(v_resultado -> 'servicios') as filas(item)
  where item ->> 'id_servicio' = v_servicio::text;
  if v_servicio_resultado is null or (v_servicio_resultado ->> 'total')::int <> 4 then
    raise exception 'FALLA: desglose por servicio: %', v_servicio_resultado;
  end if;

  -- Los servicios inactivos con turnos históricos también quedan en el desglose.
  reset role;
  update public.servicio set activo = false where id_servicio = v_servicio;
  set local role authenticated;
  v_resultado := public.fn_consultar_dashboard_operativo(v_fecha, v_fecha);
  select item into v_servicio_resultado
  from jsonb_array_elements(v_resultado -> 'servicios') as filas(item)
  where item ->> 'id_servicio' = v_servicio::text;
  if v_servicio_resultado is null or (v_servicio_resultado ->> 'activo')::boolean then
    raise exception 'FALLA: servicio inactivo con turnos: %', v_servicio_resultado;
  end if;

  -- Un profesional inactivo con actividad histórica se sigue mostrando, sin computar ocupación.
  reset role;
  update public.profesional set activo = false where id_usuario = v_prof;
  update public.usuario set activo = false where id_usuario = v_prof;
  set local role authenticated;
  v_resultado := public.fn_consultar_dashboard_operativo(v_fecha, v_fecha);
  select item into v_profesional
  from jsonb_array_elements(v_resultado -> 'profesionales') as filas(item)
  where item ->> 'id_profesional' = v_prof::text;
  if v_profesional is null
     or (v_profesional ->> 'activo')::boolean
     or v_profesional ->> 'estado_ocupacion' <> 'inactivo'
     or (v_profesional ->> 'minutos_ocupados')::int <> 90
     or v_profesional -> 'porcentaje_ocupacion' <> 'null'::jsonb then
    raise exception 'FALLA: profesional inactivo con turnos: %', v_profesional;
  end if;

  -- Sin profesionales activos, el centro informa Sin franjas y no divide por cero.
  reset role;
  update public.profesional set activo = false;
  update public.usuario u set activo = false
  where exists (select 1 from public.profesional p where p.id_usuario = u.id_usuario);
  set local role authenticated;
  v_resultado := public.fn_consultar_dashboard_operativo(v_fecha, v_fecha);
  if v_resultado #>> '{ocupacion_centro,estado}' <> 'sin_franjas'
     or (v_resultado #>> '{ocupacion_centro,minutos_ocupados}')::int <> 90
     or (v_resultado #>> '{ocupacion_centro,minutos_disponibles}')::int <> 0
     or v_resultado #> '{ocupacion_centro,porcentaje}' <> 'null'::jsonb then
    raise exception 'FALLA: período sin franjas: %', v_resultado -> 'ocupacion_centro';
  end if;

  -- Período vacío: listas sin filas, contadores en cero y sin errores.
  v_resultado := public.fn_consultar_dashboard_operativo('2020-01-01', '2020-01-31');
  if (v_resultado ->> 'pacientes_nuevos')::int <> 0
     or (v_resultado ->> 'pacientes_recurrentes')::int <> 0
     or jsonb_array_length(v_resultado -> 'servicios') <> 0 then
    raise exception 'FALLA: período sin datos: %', v_resultado;
  end if;

  -- Mesa, Profesional y usuario sin fila no pueden consultar.
  foreach v_resultado in array array[
    jsonb_build_object('sub', v_mesa, 'role', 'authenticated'),
    jsonb_build_object('sub', v_prof, 'role', 'authenticated'),
    jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')
  ] loop
    perform set_config('request.jwt.claims', v_resultado::text, true);
    begin
      perform public.fn_consultar_dashboard_operativo(v_fecha, v_fecha);
      raise exception 'FALLA: un usuario sin rol Gerente consultó el dashboard';
    exception when others then
      if sqlerrm not like '%permisos%' then raise; end if;
    end;
  end loop;

  raise notice 'HU-18: todas las pruebas pasaron';
end;
$$;

rollback;
