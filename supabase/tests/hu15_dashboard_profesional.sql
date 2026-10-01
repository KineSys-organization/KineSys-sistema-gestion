-- Pruebas HU-15 (dashboard del profesional). Todo se revierte al final.
-- Requiere la migración 017_hu15_dashboard_profesional.sql aplicada.
--
-- "Hoy" cambia todos los días y el profesional puede tener turnos reales, así que los
-- contadores se comparan antes y después de cargar los turnos de prueba (a la noche, para
-- no chocar con los reales). El calendario se prueba en un mes futuro (marzo 2027).
-- Simula cada rol con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_prof uuid;
  v_otro_prof uuid;
  v_servicio uuid;
  v_paciente uuid;
  v_turno_marzo uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_antes jsonb;
  v_r jsonb;
  v_err text;
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select u.id_usuario into v_prof
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo = true
  order by u.mail_usuario
  limit 1;
  select u.id_usuario into v_otro_prof
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo = true and u.id_usuario <> v_prof
  order by u.mail_usuario
  limit 1;
  select id_servicio into v_servicio from public.servicio limit 1;

  if v_gerente is null or v_mesa is null or v_prof is null or v_otro_prof is null or v_servicio is null then
    raise exception 'Faltan datos de prueba (Gerente, Mesa, dos profesionales activos o servicio)';
  end if;

  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente)
  values ('HU15', 'Prueba', 99015015)
  returning id_paciente into v_paciente;

  -- ============ Antes de cargar ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_antes := public.fn_consultar_dashboard_profesional(null);
  reset role;

  -- Hoy: uno por estado. Otro profesional también tiene uno hoy (no le cuenta a v_prof).
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion)
  values
    (v_prof, v_servicio, v_paciente, v_hoy, '22:00', '22:30', 'confirmado', null),
    (v_prof, v_servicio, v_paciente, v_hoy, '22:30', '23:00', 'atendido', null),
    (v_prof, v_servicio, v_paciente, v_hoy, '23:00', '23:30', 'ausente', null),
    (v_prof, v_servicio, v_paciente, v_hoy, '22:00', '22:30', 'cancelado', 'otro'),
    (v_otro_prof, v_servicio, v_paciente, v_hoy, '23:30', '23:59', 'cancelado', 'otro');

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_servicio, v_paciente, '2027-03-15', '22:00', '22:30', 'confirmado')
  returning id_turno into v_turno_marzo;

  -- ============ Profesional ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_r := public.fn_consultar_dashboard_profesional(null);

  -- Día: total sin cancelados (+3), atendidos (+1) y pendientes = confirmados (+1).
  if (v_r #>> '{dia,total}')::int - (v_antes #>> '{dia,total}')::int <> 3
     or (v_r #>> '{dia,atendidos}')::int - (v_antes #>> '{dia,atendidos}')::int <> 1
     or (v_r #>> '{dia,pendientes}')::int - (v_antes #>> '{dia,pendientes}')::int <> 1 then
    raise exception 'FALLA: contadores del día: antes % después %', v_antes -> 'dia', v_r -> 'dia';
  end if;

  -- Semana: el cancelado y el ausente de hoy (+1 cada uno); el del otro profesional no.
  if (v_r #>> '{semana,cancelaciones}')::int - (v_antes #>> '{semana,cancelaciones}')::int <> 1
     or (v_r #>> '{semana,ausencias}')::int - (v_antes #>> '{semana,ausencias}')::int <> 1 then
    raise exception 'FALLA: contadores de la semana: antes % después %', v_antes -> 'semana', v_r -> 'semana';
  end if;

  -- La semana es lunes a domingo y contiene a hoy.
  if extract(isodow from (v_r #>> '{semana,desde}')::date) <> 1
     or (v_r #>> '{semana,hasta}')::date - (v_r #>> '{semana,desde}')::date <> 6
     or v_hoy not between (v_r #>> '{semana,desde}')::date and (v_r #>> '{semana,hasta}')::date then
    raise exception 'FALLA: la semana no es lunes a domingo con hoy adentro: %', v_r -> 'semana';
  end if;

  -- Sin mes pedido: el mes de hoy.
  if (v_r #>> '{mes,desde}')::date <> date_trunc('month', v_hoy)::date then
    raise exception 'FALLA: el mes por defecto no es el actual: %', v_r #>> '{mes,desde}';
  end if;

  -- Mes pedido con cualquier día: marzo 2027 completo con el turno de prueba.
  v_r := public.fn_consultar_dashboard_profesional('2027-03-20');
  if v_r #>> '{mes,desde}' <> '2027-03-01' or v_r #>> '{mes,hasta}' <> '2027-03-31' then
    raise exception 'FALLA: rango del mes pedido: %', v_r -> 'mes';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_r #> '{mes,turnos}') e
    where e ->> 'id_turno' = v_turno_marzo::text
      and e ->> 'hora_inicio' = '22:00'
      and e ->> 'estado' = 'confirmado'
      and e ->> 'apellido_paciente' = 'Prueba'
  ) then
    raise exception 'FALLA: el turno de marzo no aparece en el calendario: %', v_r -> 'mes';
  end if;

  -- Mes sin turnos: lista vacía, sin error.
  v_r := public.fn_consultar_dashboard_profesional('2020-01-01');
  if jsonb_array_length(v_r #> '{mes,turnos}') <> 0 then
    raise exception 'FALLA: un mes sin turnos trajo datos: %', v_r -> 'mes';
  end if;

  -- ============ Otro profesional: solo ve lo suyo ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_otro_prof, 'role', 'authenticated')::text, true);
  v_r := public.fn_consultar_dashboard_profesional('2027-03-01');
  if exists (
    select 1 from jsonb_array_elements(v_r #> '{mes,turnos}') e
    where e ->> 'id_turno' = v_turno_marzo::text
  ) then
    raise exception 'FALLA: otro profesional ve un turno ajeno en su calendario';
  end if;

  -- ============ Recepción, Gerente y un usuario sin fila: bloqueados ============
  foreach v_err in array array[v_mesa::text, v_gerente::text, gen_random_uuid()::text] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_err, 'role', 'authenticated')::text, true);
    begin
      perform public.fn_consultar_dashboard_profesional(null);
      raise exception 'FALLA: un usuario que no es Profesional vio el dashboard (%)', v_err;
    exception when others then
      if sqlerrm not like '%permisos%' then raise; end if;
    end;
  end loop;

  raise notice 'HU-15: todas las pruebas pasaron';
end;
$$;

rollback;
