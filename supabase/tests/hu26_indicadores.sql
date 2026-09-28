-- Pruebas HU-26 (indicadores generales del centro). Todo se revierte al final.
-- Requiere la migración 013_hu26_indicadores_generales.sql aplicada.
--
-- Arma un caso propio en una semana futura (marzo 2027) para no depender de los turnos reales:
-- 4 turnos de un profesional activo (atendido, confirmado, ausente, cancelado) y un paciente nuevo.
-- Simula cada rol con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_prof uuid;
  v_franja public.franja_profesional;
  v_servicio uuid;
  v_paciente uuid;
  v_fecha date;
  v_esperado_disp integer;
  v_r jsonb;
  v_p jsonb;
  v_err text;
  c_desde constant date := '2027-03-01'; -- lunes
  c_hasta constant date := '2027-03-07'; -- domingo
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';

  -- Un profesional activo con una franja de al menos 2 horas.
  select f.* into v_franja
  from public.franja_profesional f
  join public.profesional p on p.id_usuario = f.id_usuario and p.activo
  join public.usuario u on u.id_usuario = f.id_usuario and u.activo and u.rol_usuario = 'Profesional'
  where f.hora_fin - f.hora_inicio >= interval '2 hours'
  order by u.mail_usuario, f.dia_semana
  limit 1;
  v_prof := v_franja.id_usuario;

  select id_servicio into v_servicio from public.servicio limit 1;

  if v_gerente is null or v_mesa is null or v_prof is null or v_servicio is null then
    raise exception 'Faltan datos de prueba (Gerente, Mesa, profesional con franja de 2 h o servicio)';
  end if;

  -- Minutos disponibles esperados del profesional en la semana: cada franja una vez.
  select sum(extract(epoch from (hora_fin - hora_inicio)) / 60)::integer into v_esperado_disp
  from public.franja_profesional where id_usuario = v_prof;

  -- Día de la semana de la franja dentro del período.
  v_fecha := c_desde + (v_franja.dia_semana - 1);

  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente, creado)
  values ('HU26', 'Prueba', 99026026, '2027-03-03 12:00:00-03')
  returning id_paciente into v_paciente;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion)
  values
    (v_prof, v_servicio, v_paciente, v_fecha, v_franja.hora_inicio, v_franja.hora_inicio + interval '30 minutes', 'atendido', null),
    (v_prof, v_servicio, v_paciente, v_fecha, v_franja.hora_inicio + interval '30 minutes', v_franja.hora_inicio + interval '60 minutes', 'confirmado', null),
    (v_prof, v_servicio, v_paciente, v_fecha, v_franja.hora_inicio + interval '60 minutes', v_franja.hora_inicio + interval '90 minutes', 'ausente', null),
    (v_prof, v_servicio, v_paciente, v_fecha, v_franja.hora_inicio + interval '90 minutes', v_franja.hora_inicio + interval '120 minutes', 'cancelado', 'otro');

  -- ============ Gerente ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Período con datos: turnos por estado, ocupación y paciente nuevo.
  v_r := public.fn_consultar_indicadores_generales(c_desde, c_hasta);
  if (v_r #>> '{turnos,total}')::int <> 4
     or (v_r #>> '{turnos,atendidos}')::int <> 1
     or (v_r #>> '{turnos,confirmados}')::int <> 1
     or (v_r #>> '{turnos,ausentes}')::int <> 1
     or (v_r #>> '{turnos,cancelados}')::int <> 1 then
    raise exception 'FALLA: conteo de turnos por estado: %', v_r -> 'turnos';
  end if;
  if (v_r ->> 'pacientes_nuevos')::int <> 1 then
    raise exception 'FALLA: pacientes nuevos: %', v_r ->> 'pacientes_nuevos';
  end if;

  select e into v_p from jsonb_array_elements(v_r -> 'profesionales') e
  where e ->> 'id_profesional' = v_prof::text;
  -- Ocupan: atendido + confirmado + ausente = 90 min. El cancelado no ocupa.
  if (v_p ->> 'minutos_ocupados')::int <> 90 or (v_p ->> 'turnos')::int <> 4 then
    raise exception 'FALLA: ocupación del profesional: %', v_p;
  end if;
  if (v_p ->> 'minutos_disponibles')::int <> v_esperado_disp then
    raise exception 'FALLA: disponibilidad esperada % y vino %', v_esperado_disp, v_p ->> 'minutos_disponibles';
  end if;
  if (v_p ->> 'porcentaje')::numeric <> round(100.0 * 90 / v_esperado_disp, 1) then
    raise exception 'FALLA: porcentaje del profesional: %', v_p ->> 'porcentaje';
  end if;
  if (v_r #>> '{ocupacion,minutos_ocupados}')::int <> 90 then
    raise exception 'FALLA: ocupación general: %', v_r -> 'ocupacion';
  end if;

  -- Período sin datos (antes de que existieran las franjas): todo en cero, sin error.
  v_r := public.fn_consultar_indicadores_generales('2020-01-01', '2020-01-31');
  if (v_r #>> '{turnos,total}')::int <> 0
     or (v_r ->> 'pacientes_nuevos')::int <> 0
     or (v_r #>> '{ocupacion,minutos_disponibles}')::int <> 0
     or (v_r #>> '{ocupacion,porcentaje}')::numeric <> 0 then
    raise exception 'FALLA: período vacío no quedó en cero: %', v_r;
  end if;

  -- Validaciones del período.
  begin
    perform public.fn_consultar_indicadores_generales(c_hasta, c_desde);
    raise exception 'FALLA: aceptó desde > hasta';
  exception when others then
    if sqlerrm not like '%posterior%' then raise; end if;
  end;
  begin
    perform public.fn_consultar_indicadores_generales('2026-01-01', '2027-06-01');
    raise exception 'FALLA: aceptó un período de 17 meses';
  exception when others then
    if sqlerrm not like '%un año%' then raise; end if;
  end;
  begin
    perform public.fn_consultar_indicadores_generales(null, c_hasta);
    raise exception 'FALLA: aceptó fechas vacías';
  exception when others then
    if sqlerrm not like '%período%' then raise; end if;
  end;

  -- ============ Otros roles: bloqueados ============
  foreach v_err in array array[v_mesa::text, v_prof::text, gen_random_uuid()::text] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_err, 'role', 'authenticated')::text, true);
    begin
      perform public.fn_consultar_indicadores_generales(c_desde, c_hasta);
      raise exception 'FALLA: un usuario que no es Gerente vio los indicadores (%)', v_err;
    exception when others then
      if sqlerrm not like '%permisos%' then raise; end if;
    end;
  end loop;

  raise notice 'HU-26: todas las pruebas pasaron';
end;
$$;

rollback;
