-- Pruebas HU-37: repetir un turno en varios días de la semana.
-- Requiere 032_hu37_repetir_varios_dias.sql (y 031 para el motivo "Bloqueado").
-- Usa fechas de 2099 para no chocar con turnos reales. Todo se revierte al final.
begin;

do $$
declare
  v_gerente uuid;
  v_prof uuid;
  v_servicio uuid;
  v_paciente uuid;
  v_d1 integer;
  v_d2 integer;
  v_h1 time;
  v_h2 time;
  v_sin_franja integer;
  v_fecha date;
  v_turno uuid;
  v_serie uuid;
  v_res jsonb;
  v_cant integer;
  v_motivo text;
  v_primera date;
  v_segunda date;
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';

  -- Profesional activo con servicio y franjas en al menos dos días distintos.
  select sp.id_usuario, sp.id_servicio
    into v_prof, v_servicio
  from public.servicio_profesional sp
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo
  join public.profesional p on p.id_usuario = sp.id_usuario and p.activo
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo and u.rol_usuario = 'Profesional'
  where (select count(distinct f.dia_semana) from public.franja_profesional f where f.id_usuario = sp.id_usuario) between 2 and 6
  order by sp.id_usuario
  limit 1;

  if v_gerente is null or v_prof is null then
    raise exception 'Faltan datos de prueba (Gerente o profesional con dos días de franja)';
  end if;

  select f.dia_semana, min(f.hora_inicio) into v_d1, v_h1
  from public.franja_profesional f where f.id_usuario = v_prof
  group by f.dia_semana order by f.dia_semana limit 1;
  select f.dia_semana, min(f.hora_inicio) into v_d2, v_h2
  from public.franja_profesional f where f.id_usuario = v_prof and f.dia_semana > v_d1
  group by f.dia_semana order by f.dia_semana limit 1;
  select d into v_sin_franja from generate_series(1, 7) d
  where not exists (select 1 from public.franja_profesional f where f.id_usuario = v_prof and f.dia_semana = d)
  limit 1;

  -- Turno original en 2099, el día v_d1 a la hora de inicio de su franja.
  select g::date into v_fecha
  from generate_series('2099-06-01'::date, '2099-06-07'::date, interval '1 day') g
  where extract(isodow from g)::integer = v_d1;

  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente)
  values ('HU37', 'Prueba', floor(random() * 10000000)::bigint + 60000000)
  returning id_paciente into v_paciente;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, prioridad)
  values (
    v_prof, v_servicio, v_paciente, v_fecha, v_h1,
    v_h1 + make_interval(mins => (select duracion_minutos from public.servicio where id_servicio = v_servicio)),
    'confirmado', 'alta'
  )
  returning id_turno into v_turno;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. Sin días se comporta como HU-25: el mismo día, una vez por semana.
  select count(*) into v_cant
  from public.fn_turno_repetir_preview(v_turno, null, null, 3, null) r
  where r.dia_semana = v_d1 and r.hora_inicio = to_char(v_h1, 'HH24:MI') and r.disponible;
  if v_cant <> 3 then
    raise exception 'FALLA: sin días no repite como HU-25 (%)', v_cant;
  end if;

  -- 2. Dos días con horas distintas, 2 semanas: 4 fechas, todas libres y cada una con su hora.
  select count(*) into v_cant
  from public.fn_turno_repetir_preview(v_turno, array[v_d1, v_d2], array[v_h1, v_h2], 2, null) r
  where r.disponible
    and r.hora_inicio = to_char(case when r.dia_semana = v_d1 then v_h1 else v_h2 end, 'HH24:MI');
  if v_cant <> 4 then
    raise exception 'FALLA: dos días con horas distintas (% disponibles de 4)', v_cant;
  end if;

  -- 3. Por cantidad de sesiones: exactamente 3, en orden y sin repetir el original.
  select count(*), min(r.fecha) into v_cant, v_primera
  from public.fn_turno_repetir_preview(v_turno, array[v_d1, v_d2], array[v_h1, v_h2], null, 3) r;
  if v_cant <> 3 or v_primera <= v_fecha then
    raise exception 'FALLA: por sesiones (% fechas, primera %)', v_cant, v_primera;
  end if;

  -- 4. Un día sin franja se avisa y no se da por disponible.
  if v_sin_franja is not null then
    select r.motivo into v_motivo
    from public.fn_turno_repetir_preview(v_turno, array[v_sin_franja], null, 1, null) r;
    if v_motivo not like 'El profesional no atiende los%' then
      raise exception 'FALLA: día sin franja: %', v_motivo;
    end if;
  end if;

  -- 5. Una fecha ocupada y otra bloqueada (HU-33) se informan con su motivo.
  select min(r.fecha) filter (where r.dia_semana = v_d1),
         min(r.fecha) filter (where r.dia_semana = v_d2)
    into v_primera, v_segunda
  from public.fn_turno_repetir_preview(v_turno, array[v_d1, v_d2], array[v_h1, v_h2], 2, null) r;

  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (
    v_prof, v_servicio, v_paciente, v_primera, v_h1,
    v_h1 + make_interval(mins => (select duracion_minutos from public.servicio where id_servicio = v_servicio)),
    'confirmado'
  );
  insert into public.bloqueo_agenda (id_profesional, fecha_desde, fecha_hasta, motivo, creado_por)
  values (null, v_segunda, v_segunda, 'Feriado HU37', v_gerente);
  set local role authenticated;

  select r.motivo into v_motivo
  from public.fn_turno_repetir_preview(v_turno, array[v_d1, v_d2], array[v_h1, v_h2], 2, null) r
  where r.fecha = v_primera;
  if v_motivo <> 'Horario ocupado' then
    raise exception 'FALLA: fecha ocupada: %', v_motivo;
  end if;
  select r.motivo into v_motivo
  from public.fn_turno_repetir_preview(v_turno, array[v_d1, v_d2], array[v_h1, v_h2], 2, null) r
  where r.fecha = v_segunda;
  if v_motivo <> 'Bloqueado: Feriado HU37' then
    raise exception 'FALLA: fecha bloqueada: %', v_motivo;
  end if;

  -- 6. Confirmar crea solo las libres, todas en la misma serie y con la prioridad del original.
  v_res := public.fn_turno_repetir_confirmar(v_turno, array[v_d1, v_d2], array[v_h1, v_h2], 2, null);
  v_serie := (v_res ->> 'id_serie')::uuid;
  if jsonb_array_length(v_res -> 'creados') <> 2 or jsonb_array_length(v_res -> 'omitidos') <> 2 then
    raise exception 'FALLA: confirmar no respeta las omitidas: %', v_res;
  end if;
  reset role;
  select count(*) into v_cant
  from public.turno
  where id_serie = v_serie and id_paciente = v_paciente and prioridad = 'alta';
  if v_serie is null or v_cant <> 3 then
    raise exception 'FALLA: la serie no tiene el original y los dos nuevos (%)', v_cant;
  end if;
  set local role authenticated;

  -- 7. Validaciones.
  begin
    perform public.fn_turno_repetir_preview(v_turno, array[]::integer[], null, 2, null);
    raise exception 'FALLA: aceptó ningún día';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%al menos un día%' then raise; end if;
  end;
  begin
    perform public.fn_turno_repetir_preview(v_turno, array[v_d1], array['10:00:30'::time], 2, null);
    raise exception 'FALLA: aceptó una hora con segundos';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%formato válido%' then raise; end if;
  end;
  begin
    perform public.fn_turno_repetir_preview(v_turno, array[v_d1], null, 0, null);
    raise exception 'FALLA: aceptó cero semanas';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%mayor a cero%' then raise; end if;
  end;
  begin
    perform public.fn_turno_repetir_preview(v_turno, array[v_d1, v_d2], null, 13, null);
    raise exception 'FALLA: aceptó más de 24 turnos';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%más de 24%' then raise; end if;
  end;
  begin
    perform public.fn_turno_repetir_preview(v_turno, array[v_d1], null, 2, 2);
    raise exception 'FALLA: aceptó semanas y sesiones juntas';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%no las dos%' then raise; end if;
  end;

  -- 8. El Profesional no puede repetir turnos.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_turno_repetir_preview(v_turno, null, null, 1, null);
    raise exception 'FALLA: el Profesional vio el preview';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%permiso%' then raise; end if;
  end;

  raise notice 'HU-37: todas las pruebas pasaron';
end;
$$;

rollback;
