-- Pruebas HU-26 (indicadores generales, vista corta del Incremento 2). Todo se revierte al final.
-- Requiere la migración 013_hu26_indicadores_generales.sql aplicada.
--
-- Arma un caso propio en una semana futura (marzo 2027) para no depender de los turnos reales:
-- 4 turnos (atendido, confirmado, ausente, cancelado), uno de ellos un sábado, y un paciente nuevo.
-- Simula cada rol con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_prof uuid;
  v_servicio uuid;
  v_paciente uuid;
  v_r jsonb;
  v_err text;
  c_desde constant date := '2027-03-01'; -- lunes
  c_hasta constant date := '2027-03-07'; -- domingo
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select u.id_usuario into v_prof
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo = true
  order by u.mail_usuario
  limit 1;
  select id_servicio into v_servicio from public.servicio limit 1;

  if v_gerente is null or v_mesa is null or v_prof is null or v_servicio is null then
    raise exception 'Faltan datos de prueba (Gerente, Mesa, profesional activo o servicio)';
  end if;

  -- Paciente dado de alta dentro del período (hora de Argentina).
  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente, creado)
  values ('HU26', 'Prueba', 99026026, '2027-03-03 12:00:00-03')
  returning id_paciente into v_paciente;

  -- Uno por estado. El atendido cae un sábado: también cuenta.
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion)
  values
    (v_prof, v_servicio, v_paciente, '2027-03-06', '09:00', '09:30', 'atendido', null),
    (v_prof, v_servicio, v_paciente, '2027-03-02', '09:00', '09:30', 'confirmado', null),
    (v_prof, v_servicio, v_paciente, '2027-03-02', '09:30', '10:00', 'ausente', null),
    (v_prof, v_servicio, v_paciente, '2027-03-02', '10:00', '10:30', 'cancelado', 'otro'),
    -- Fuera del período: no cuenta.
    (v_prof, v_servicio, v_paciente, '2027-03-08', '09:00', '09:30', 'confirmado', null);

  -- ============ Gerente ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Período con datos: totales por estado y paciente nuevo.
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

  -- Vista corta: sin ocupación ni desglose (son de HU-18).
  if v_r ? 'ocupacion' or v_r ? 'profesionales' then
    raise exception 'FALLA: la vista corta no debe traer ocupación ni desglose: %', v_r;
  end if;

  -- Un día solo (desde = hasta).
  v_r := public.fn_consultar_indicadores_generales('2027-03-02', '2027-03-02');
  if (v_r #>> '{turnos,total}')::int <> 3 or (v_r ->> 'pacientes_nuevos')::int <> 0 then
    raise exception 'FALLA: período de un día: %', v_r;
  end if;

  -- Período sin datos: todo en cero, sin error.
  v_r := public.fn_consultar_indicadores_generales('2020-01-01', '2020-01-31');
  if (v_r #>> '{turnos,total}')::int <> 0
     or (v_r #>> '{turnos,confirmados}')::int <> 0
     or (v_r #>> '{turnos,atendidos}')::int <> 0
     or (v_r #>> '{turnos,cancelados}')::int <> 0
     or (v_r #>> '{turnos,ausentes}')::int <> 0
     or (v_r ->> 'pacientes_nuevos')::int <> 0 then
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
