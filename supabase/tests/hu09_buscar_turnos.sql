-- Pruebas HU-09 (buscar y filtrar turnos). Todo se revierte al final.
-- Requiere las migraciones 014 y 016 aplicadas.
--
-- Arma sus propios turnos en una fecha lejana (hoy - 500) para no depender de los datos
-- reales: 12 de Zulema (paginación) y 3 de Zoilo con otro profesional, servicio y estado.
-- Necesita 2 profesionales y 2 servicios cargados; Mesa de Entradas carlaperez@.
begin;

do $$
declare
  v_mesa uuid;
  v_prof_usuario uuid;
  v_prof_a uuid;
  v_prof_b uuid;
  v_serv_a uuid;
  v_serv_b uuid;
  v_dia date := (timezone('America/Argentina/Buenos_Aires', now()))::date - 500;
  v_pac1 uuid;
  v_pac2 uuid;
  v_res jsonb;
  v_ids uuid[];
  i integer;
begin
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select u.id_usuario into v_prof_usuario
  from public.usuario u
  where u.rol_usuario = 'Profesional' and u.activo = true
  order by u.mail_usuario
  limit 1;

  -- Dos profesionales y dos servicios cualesquiera (los turnos se insertan directo).
  v_ids := array(select id_usuario from public.profesional order by id_usuario limit 2);
  v_prof_a := v_ids[1];
  v_prof_b := v_ids[2];

  v_ids := array(select id_servicio from public.servicio order by id_servicio limit 2);
  v_serv_a := v_ids[1];
  v_serv_b := v_ids[2];

  if v_mesa is null or v_prof_b is null or v_serv_b is null then
    raise exception 'Faltan datos de prueba (Mesa de Entradas, 2 profesionales y 2 servicios)';
  end if;

  -- ============ Datos (como postgres) ============
  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente, fecha_nacimiento_paciente, telefono_paciente, activo)
  values ('Zulema', 'Testhuno', 99090901, date '1990-01-01', '1100000090', true)
  returning id_paciente into v_pac1;
  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente, fecha_nacimiento_paciente, telefono_paciente, activo)
  values ('Zoilo', 'Testhuno', 99090902, date '1980-01-01', '1100000091', true)
  returning id_paciente into v_pac2;

  -- 12 turnos de Zulema con A (08:00 a 19:00), cargados en desorden para probar el orden.
  for i in reverse 11..0 loop
    insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
    values (v_prof_a, v_serv_a, v_pac1, v_dia, time '08:00' + make_interval(hours => i),
            time '08:30' + make_interval(hours => i), 'confirmado');
  end loop;

  -- Zoilo con B: uno cancelado, uno atendido y uno ausente (el día siguiente).
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion)
  values (v_prof_b, v_serv_b, v_pac2, v_dia + 1, time '09:00', time '09:30', 'cancelado', 'otro');
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof_b, v_serv_b, v_pac2, v_dia + 1, time '10:00', time '10:30', 'atendido');
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof_b, v_serv_b, v_pac2, v_dia + 1, time '11:00', time '11:30', 'ausente');

  -- ============ Sesión de Mesa de Entradas ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ---------- Rango de un día + paginación de a 10 ----------
  v_res := public.fn_buscar_turnos(null, null, null, v_dia, v_dia, null, 1);
  if (v_res ->> 'total')::integer < 12 or jsonb_array_length(v_res -> 'turnos') <> 10 then
    raise exception 'FALLA: la primera página tendría que traer 10 de al menos 12: %', v_res ->> 'total';
  end if;

  -- Solo los de prueba (texto) para contar exacto.
  v_res := public.fn_buscar_turnos('testhuno', null, null, v_dia, v_dia, null, 1);
  if (v_res ->> 'total')::integer <> 12
    or jsonb_array_length(v_res -> 'turnos') <> 10
    or v_res -> 'turnos' -> 0 ->> 'hora_inicio' <> '08:00'
    or v_res -> 'turnos' -> 9 ->> 'hora_inicio' <> '17:00' then
    raise exception 'FALLA: página 1 mal ordenada o incompleta: %', v_res;
  end if;

  v_res := public.fn_buscar_turnos('testhuno', null, null, v_dia, v_dia, null, 2);
  if jsonb_array_length(v_res -> 'turnos') <> 2
    or v_res -> 'turnos' -> 0 ->> 'hora_inicio' <> '18:00'
    or (v_res ->> 'pagina')::integer <> 2 then
    raise exception 'FALLA: página 2 mal: %', v_res;
  end if;

  -- Más allá de la última: lista vacía pero el total sigue bien.
  v_res := public.fn_buscar_turnos('testhuno', null, null, v_dia, v_dia, null, 5);
  if jsonb_array_length(v_res -> 'turnos') <> 0 or (v_res ->> 'total')::integer <> 12 then
    raise exception 'FALLA: página fuera de rango: %', v_res;
  end if;

  -- Cada resultado trae lo que muestra la tabla.
  v_res := public.fn_buscar_turnos('testhuno', null, null, v_dia, v_dia, null, 1);
  if not (
    (v_res -> 'turnos' -> 0)
      ?& array['fecha', 'hora_inicio', 'hora_fin', 'nombre_paciente', 'apellido_paciente',
               'dni_paciente', 'nombre_profesional', 'apellido_profesional',
               'nombre_servicio', 'estado', 'id_turno']
  ) then
    raise exception 'FALLA: faltan columnas en el resultado';
  end if;

  -- ---------- Paciente: DNI, parcial, nombre Y apellido ----------
  v_res := public.fn_buscar_turnos('99090902', null, null, null, null, null, 1);
  if (v_res ->> 'total')::integer <> 3 then
    raise exception 'FALLA: búsqueda por DNI: %', v_res ->> 'total';
  end if;

  v_res := public.fn_buscar_turnos('990909', null, null, null, null, null, 1);
  if (v_res ->> 'total')::integer <> 15 then
    raise exception 'FALLA: búsqueda por comienzo de DNI: %', v_res ->> 'total';
  end if;

  v_res := public.fn_buscar_turnos('zul', null, null, null, null, null, 1);
  if (v_res ->> 'total')::integer <> 12 then
    raise exception 'FALLA: coincidencia parcial de nombre: %', v_res ->> 'total';
  end if;

  v_res := public.fn_buscar_turnos('  Zoilo   TESTHUNO ', null, null, null, null, null, 1);
  if (v_res ->> 'total')::integer <> 3 then
    raise exception 'FALLA: nombre y apellido juntos: %', v_res ->> 'total';
  end if;

  v_res := public.fn_buscar_turnos('Zoilo Inexistentez', null, null, null, null, null, 1);
  if (v_res ->> 'total')::integer <> 0 or jsonb_array_length(v_res -> 'turnos') <> 0 then
    raise exception 'FALLA: nombre y apellido tienen que coincidir los dos';
  end if;

  -- "%" se busca literal (no es comodín).
  v_res := public.fn_buscar_turnos('%', null, null, v_dia, v_dia + 1, null, 1);
  if (v_res ->> 'total')::integer <> 0 then
    raise exception 'FALLA: "%%" funcionó como comodín';
  end if;

  -- ---------- Profesional, servicio y estado ----------
  v_res := public.fn_buscar_turnos('testhuno', v_prof_b, null, null, null, null, 1);
  if (v_res ->> 'total')::integer <> 3 then
    raise exception 'FALLA: filtro por profesional: %', v_res ->> 'total';
  end if;

  v_res := public.fn_buscar_turnos('testhuno', null, v_serv_a, null, null, null, 1);
  if (v_res ->> 'total')::integer <> 12 then
    raise exception 'FALLA: filtro por servicio: %', v_res ->> 'total';
  end if;

  v_res := public.fn_buscar_turnos('testhuno', null, null, null, null, 'ausente', 1);
  if (v_res ->> 'total')::integer <> 1 or v_res -> 'turnos' -> 0 ->> 'estado' <> 'ausente' then
    raise exception 'FALLA: filtro por estado ausente: %', v_res;
  end if;

  v_res := public.fn_buscar_turnos('testhuno', null, null, null, null, 'Todos', 1);
  if (v_res ->> 'total')::integer <> 15 then
    raise exception 'FALLA: "Todos" no tendría que filtrar por estado';
  end if;

  -- ---------- Todos los filtros juntos (AND) ----------
  v_res := public.fn_buscar_turnos('zoilo', v_prof_b, v_serv_b, v_dia + 1, v_dia + 1, 'cancelado', 1);
  if (v_res ->> 'total')::integer <> 1
    or v_res -> 'turnos' -> 0 ->> 'motivo_cancelacion' <> 'otro' then
    raise exception 'FALLA: filtros combinados: %', v_res;
  end if;

  v_res := public.fn_buscar_turnos('zoilo', v_prof_a, null, null, null, null, 1);
  if (v_res ->> 'total')::integer <> 0 then
    raise exception 'FALLA: un filtro que no coincide tendría que dejar la lista vacía';
  end if;

  -- ---------- Validaciones ----------
  begin
    perform public.fn_buscar_turnos(null, null, null, v_dia, v_dia - 1, null, 1);
    raise exception 'FALLA: aceptó Hasta anterior a Desde';
  exception when others then
    if sqlerrm <> 'La fecha Hasta no puede ser anterior a Desde' then raise; end if;
  end;

  begin
    perform public.fn_buscar_turnos(null, null, null, null, null, 'borrado', 1);
    raise exception 'FALLA: aceptó un estado inválido';
  exception when others then
    if sqlerrm <> 'El estado no es válido' then raise; end if;
  end;

  -- ---------- Un Profesional no puede ----------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_usuario, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_buscar_turnos(null, null, null, null, null, null, 1);
    raise exception 'FALLA: un Profesional pudo buscar turnos';
  exception when others then
    if sqlerrm <> 'No tenés permiso para consultar turnos' then raise; end if;
  end;

  reset role;
  raise notice 'HU-09: todas las pruebas pasaron';
end;
$$;

rollback;
