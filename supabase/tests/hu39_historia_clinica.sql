-- Pruebas HU-39 (historia clínica del paciente). Todo se revierte al final.
-- Requiere la migración 024_hu39_historia_clinica.sql aplicada.
--
-- Arma un paciente nuevo con turnos en abril 2027 (no choca con los reales):
--   * profesional A: un turno atendido (con su atención y orden médica) -> puede ver y editar.
--   * profesional B: al principio sin turnos con el paciente -> bloqueado; después con un
--     turno cancelado -> ve y edita la MISMA ficha (cualquier estado cuenta).
-- Simula cada rol con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_prof_a uuid;
  v_prof_b uuid;
  v_servicio uuid;
  v_paciente uuid;
  v_turno uuid;
  v_r jsonb;
  v_err text;
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select u.id_usuario into v_prof_a
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo = true
  order by u.mail_usuario
  limit 1;
  select u.id_usuario into v_prof_b
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo = true and u.id_usuario <> v_prof_a
  order by u.mail_usuario
  limit 1;
  select id_servicio into v_servicio from public.servicio limit 1;

  if v_gerente is null or v_mesa is null or v_prof_a is null or v_prof_b is null or v_servicio is null then
    raise exception 'Faltan datos de prueba (Gerente, Mesa, dos profesionales activos o servicio)';
  end if;

  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente)
  values ('HU39', 'Prueba', 99039039)
  returning id_paciente into v_paciente;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof_a, v_servicio, v_paciente, '2027-04-01', '22:00', '22:30', 'atendido')
  returning id_turno into v_turno;

  insert into public.atencion (id_turno, id_profesional, id_paciente, fecha_atencion, observaciones, motivo_consulta, orden_medica)
  values (v_turno, v_prof_a, v_paciente, '2027-04-01', 'Dolor lumbar, se trabajó movilidad', 'Primera consulta', '10 sesiones de kinesiología');

  -- ============ Profesional A ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Sin ficha: null, sin versiones; la evolución ya trae la atención con la orden médica.
  v_r := public.fn_obtener_historia_clinica(v_paciente);
  if v_r -> 'ficha' <> 'null'::jsonb or jsonb_array_length(v_r -> 'versiones') <> 0 then
    raise exception 'FALLA: paciente sin ficha: %', v_r;
  end if;
  if jsonb_array_length(v_r -> 'evolucion') <> 1
     or v_r #>> '{evolucion,0,orden_medica}' <> '10 sesiones de kinesiología'
     or v_r #>> '{evolucion,0,motivo_consulta}' <> 'Primera consulta' then
    raise exception 'FALLA: evolución: %', v_r -> 'evolucion';
  end if;
  if v_r #>> '{paciente,apellido_paciente}' <> 'Prueba' then
    raise exception 'FALLA: datos del paciente: %', v_r -> 'paciente';
  end if;

  -- Validaciones: todo vacío y más de 1000 caracteres.
  begin
    perform public.fn_guardar_historia_clinica(v_paciente, '  ', null, '', null, null, null);
    raise exception 'FALLA: aceptó una ficha vacía';
  exception when others then
    if sqlerrm not like '%al menos un campo%' then raise; end if;
  end;
  begin
    perform public.fn_guardar_historia_clinica(v_paciente, null, null, repeat('x', 1001), null, null, null);
    raise exception 'FALLA: aceptó un campo de 1001 caracteres';
  exception when others then
    if sqlerrm not like '%1000 caracteres%' then raise; end if;
  end;

  -- Crear: queda quién la modificó, sin versiones.
  v_r := public.fn_guardar_historia_clinica(v_paciente, null, null, '  Penicilina  ', null, 'Lumbalgia', null);
  if v_r #>> '{ficha,alergias}' <> 'Penicilina'
     or v_r #>> '{ficha,diagnostico}' <> 'Lumbalgia'
     or v_r #>> '{ficha,antecedentes_personales}' is not null
     or v_r #>> '{ficha,modificado_por}' is null
     or jsonb_array_length(v_r -> 'versiones') <> 0 then
    raise exception 'FALLA: crear la ficha: %', v_r;
  end if;
  if (select count(*) from public.historia_clinica where id_paciente = v_paciente) <> 1 then
    raise exception 'FALLA: no hay una sola ficha';
  end if;

  -- Guardar lo mismo no crea versión.
  v_r := public.fn_guardar_historia_clinica(v_paciente, null, null, 'Penicilina', null, 'Lumbalgia', null);
  if jsonb_array_length(v_r -> 'versiones') <> 0 then
    raise exception 'FALLA: guardar sin cambios creó una versión';
  end if;

  -- Editar: la versión anterior queda guardada con sus valores.
  v_r := public.fn_guardar_historia_clinica(v_paciente, 'Hipertensión', null, 'Penicilina, ibuprofeno', null, 'Lumbalgia', null);
  if v_r #>> '{ficha,alergias}' <> 'Penicilina, ibuprofeno'
     or jsonb_array_length(v_r -> 'versiones') <> 1
     or v_r #>> '{versiones,0,alergias}' <> 'Penicilina'
     or v_r #>> '{versiones,0,antecedentes_personales}' is not null then
    raise exception 'FALLA: editar la ficha: %', v_r;
  end if;

  -- ============ Profesional B sin turnos con el paciente: bloqueado ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_b, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_obtener_historia_clinica(v_paciente);
    raise exception 'FALLA: un profesional sin turnos vio la historia clínica';
  exception when others then
    if sqlerrm not like '%No tenés turnos con este paciente%' then raise; end if;
  end;
  begin
    perform public.fn_guardar_historia_clinica(v_paciente, 'x', null, null, null, null, null);
    raise exception 'FALLA: un profesional sin turnos editó la historia clínica';
  exception when others then
    if sqlerrm not like '%No tenés turnos con este paciente%' then raise; end if;
  end;
  -- Paciente inexistente: mismo mensaje.
  begin
    perform public.fn_obtener_historia_clinica(gen_random_uuid());
    raise exception 'FALLA: aceptó un paciente inexistente';
  exception when others then
    if sqlerrm not like '%No tenés turnos con este paciente%' then raise; end if;
  end;

  -- ============ Profesional B con un turno cancelado: ve y edita la misma ficha ============
  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion)
  values (v_prof_b, v_servicio, v_paciente, '2027-04-02', '22:00', '22:30', 'cancelado', 'otro');
  set local role authenticated;

  v_r := public.fn_obtener_historia_clinica(v_paciente);
  if v_r #>> '{ficha,alergias}' <> 'Penicilina, ibuprofeno' or jsonb_array_length(v_r -> 'evolucion') <> 1 then
    raise exception 'FALLA: el profesional B no ve la ficha compartida: %', v_r;
  end if;

  v_r := public.fn_guardar_historia_clinica(v_paciente, 'Hipertensión', null, 'Penicilina, ibuprofeno', 'Enalapril', 'Lumbalgia', null);
  if jsonb_array_length(v_r -> 'versiones') <> 2
     or v_r #>> '{ficha,medicacion_actual}' <> 'Enalapril' then
    raise exception 'FALLA: edición del profesional B: %', v_r;
  end if;

  -- ============ Mesa de Entradas, Gerente y cuenta sin fila: bloqueados ============
  foreach v_err in array array[v_mesa::text, v_gerente::text, gen_random_uuid()::text] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_err, 'role', 'authenticated')::text, true);
    begin
      perform public.fn_obtener_historia_clinica(v_paciente);
      raise exception 'FALLA: un usuario que no es Profesional vio la historia clínica (%)', v_err;
    exception when others then
      if sqlerrm not like '%permisos%' then raise; end if;
    end;
    begin
      perform public.fn_guardar_historia_clinica(v_paciente, 'x', null, null, null, null, null);
      raise exception 'FALLA: un usuario que no es Profesional editó la historia clínica (%)', v_err;
    exception when others then
      if sqlerrm not like '%permisos%' then raise; end if;
    end;
  end loop;

  -- ============ Las tablas no se leen directo ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_a, 'role', 'authenticated')::text, true);
  begin
    perform 1 from public.historia_clinica;
    raise exception 'FALLA: authenticated lee la tabla historia_clinica directo';
  exception when insufficient_privilege then
    null;
  end;

  -- La última modificación quedó a nombre del profesional B.
  reset role;
  if (select modificado_por from public.historia_clinica where id_paciente = v_paciente) <> v_prof_b then
    raise exception 'FALLA: la ficha no quedó modificada por el profesional B';
  end if;

  raise notice 'HU-39: todas las pruebas pasaron';
end;
$$;

rollback;
