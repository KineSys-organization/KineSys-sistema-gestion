-- Pruebas HU-06 (otorgar turno). Todo se revierte al final.
-- Simula la sesión de un usuario de Mesa de Entradas con request.jwt.claims.
-- Requiere un profesional activo con franja y servicio (HU-02A/02B).
begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    (select id_usuario from public.usuario
     where rol_usuario = 'Mesa de Entradas' and activo = true
     limit 1)
  )::text,
  true
);

do $$
declare
  v_recepcion text := current_setting('request.jwt.claims', true);
  v_prof uuid;
  v_serv uuid;
  v_dia integer;
  v_fecha date;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_disp jsonb;
  v_hora1 time;
  v_hora2 time;
  v_obra1 uuid;
  v_obra2 uuid;
  v_obra_ajena uuid;
  v_pac1 uuid;
  v_pac2 uuid;
  v_turno jsonb;
  v_estado text;
begin
  if not public.fn_es_recepcion() then
    raise exception 'Estas pruebas requieren sesión de Gerente o Mesa de Entradas';
  end if;

  -- Datos de base: profesional activo con franja y servicio asociado.
  select f.id_usuario, sp.id_servicio, f.dia_semana
  into v_prof, v_serv, v_dia
  from public.franja_profesional f
  join public.profesional p on p.id_usuario = f.id_usuario and p.activo = true
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo = true
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo = true
  limit 1;

  if v_prof is null then
    raise exception 'Falta un profesional con franja y servicio para probar';
  end if;

  -- Próxima fecha (desde mañana, dentro de 30 días) que caiga en ese día de la semana.
  select d::date into v_fecha
  from generate_series(v_hoy + 1, v_hoy + 30, interval '1 day') d
  where extract(isodow from d)::integer = v_dia
  order by d
  limit 1;

  v_disp := public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha);
  if jsonb_array_length(v_disp -> 'horarios') < 2 then
    raise exception 'Se necesitan al menos dos horarios libres para probar';
  end if;
  v_hora1 := (v_disp -> 'horarios' ->> 0)::time;
  v_hora2 := (v_disp -> 'horarios' ->> 1)::time;

  select id_obra_social into v_obra1 from public.obra_social order by nombre_obra_social limit 1;
  select id_obra_social into v_obra2 from public.obra_social order by nombre_obra_social offset 1 limit 1;
  select id_obra_social into v_obra_ajena from public.obra_social order by nombre_obra_social offset 2 limit 1;

  -- Paciente con dos obras sociales y paciente particular.
  v_pac1 := public.fn_registrar_paciente(
    'Ana', 'TestHU06', 99006001, date '1990-05-10',
    '1100000006', 'ana.hu06@test.com',
    jsonb_build_array(
      jsonb_build_object('id_obra_social', v_obra1, 'numero_afiliado', 'A-1'),
      jsonb_build_object('id_obra_social', v_obra2, 'numero_afiliado', 'B-2')
    )
  );
  v_pac2 := public.fn_registrar_paciente(
    'Bruno', 'TestHU06', 99006002, date '1985-08-20',
    '1100000007', 'bruno.hu06@test.com', '[]'::jsonb
  );

  -- Criterios 1, 5 y 6: se crea con todos los datos y la segunda obra elegida.
  v_turno := public.fn_otorgar_turno(v_pac1, v_prof, v_serv, v_fecha, v_hora1, v_obra2);

  if (v_turno ->> 'id_paciente')::uuid <> v_pac1
    or (v_turno ->> 'id_profesional')::uuid <> v_prof
    or (v_turno ->> 'id_servicio')::uuid <> v_serv
    or (v_turno ->> 'fecha')::date <> v_fecha
    or (v_turno ->> 'hora_inicio') <> to_char(v_hora1, 'HH24:MI') then
    raise exception 'C1: el turno no quedó con paciente, profesional, servicio, fecha y hora';
  end if;

  if (v_turno ->> 'id_obra_social')::uuid <> v_obra2
    or (v_turno ->> 'numero_afiliado') <> 'B-2' then
    raise exception 'C6: no guardó la obra social elegida';
  end if;

  if v_turno ->> 'nombre_paciente' is null
    or v_turno ->> 'apellido_profesional' is null
    or v_turno ->> 'hora_fin' is null then
    raise exception 'C5: faltan datos para el resumen';
  end if;

  -- Criterio 3: al consultarlo figura confirmado.
  v_estado := public.fn_obtener_turno((v_turno ->> 'id_turno')::uuid) ->> 'estado';
  if v_estado <> 'confirmado' then
    raise exception 'C3: el estado es % y debería ser confirmado', v_estado;
  end if;

  -- El horario tomado ya no aparece en la disponibilidad (HU-05).
  if (public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha) -> 'horarios')
      ? to_char(v_hora1, 'HH24:MI') then
    raise exception 'HU-05 sigue ofreciendo un horario ocupado';
  end if;

  -- Criterio 2: otro intenta confirmar el mismo horario.
  begin
    perform public.fn_otorgar_turno(v_pac2, v_prof, v_serv, v_fecha, v_hora1, null);
    raise exception 'C2: debió rechazar el horario ocupado';
  exception when others then
    if sqlerrm <> 'El horario seleccionado ya no está disponible' then raise; end if;
  end;

  -- Criterio 2 (defensa en base): un insert superpuesto choca con la restricción EXCLUDE.
  begin
    insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin)
    values (v_prof, v_serv, v_pac2, v_fecha, v_hora1 + interval '1 minute', v_hora1 + interval '20 minutes');
    raise exception 'C2: la restricción EXCLUDE debió rechazar el solapamiento';
  exception when exclusion_violation then
    null;
  end;

  -- Criterio 6: Particular (null) queda guardado como Particular.
  v_turno := public.fn_otorgar_turno(v_pac2, v_prof, v_serv, v_fecha, v_hora2, null);
  if v_turno ->> 'cobertura' <> 'Particular' or v_turno ->> 'id_obra_social' is not null then
    raise exception 'C6: no guardó la cobertura Particular';
  end if;

  -- Criterio 6: una obra que el paciente no tiene se rechaza.
  begin
    perform public.fn_otorgar_turno(
      v_pac1, v_prof, v_serv, v_fecha,
      (v_disp -> 'horarios' ->> 2)::time, v_obra_ajena
    );
    raise exception 'C6: debió rechazar una obra social ajena al paciente';
  exception when others then
    if sqlerrm <> 'La obra social elegida no corresponde al paciente' then raise; end if;
  end;

  -- Criterio 4: fecha pasada y hora pasada de hoy.
  begin
    perform public.fn_otorgar_turno(v_pac1, v_prof, v_serv, v_hoy - 1, v_hora1, null);
    raise exception 'C4: debió rechazar una fecha pasada';
  exception when others then
    if sqlerrm <> 'No se pueden otorgar turnos con fecha anterior a la actual' then raise; end if;
  end;

  begin
    perform public.fn_otorgar_turno(v_pac1, v_prof, v_serv, v_hoy, time '00:00', null);
    raise exception 'C4: debió rechazar una hora pasada de hoy';
  exception when others then
    if sqlerrm <> 'No se pueden otorgar turnos con fecha anterior a la actual' then raise; end if;
  end;

  -- Permisos: un Profesional no puede otorgar turnos.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_prof)::text,
    true
  );
  begin
    perform public.fn_otorgar_turno(v_pac1, v_prof, v_serv, v_fecha, v_hora2, null);
    raise exception 'Debió rechazar a un usuario sin rol de recepción';
  exception when others then
    if sqlerrm <> 'No tenés permiso para otorgar turnos' then raise; end if;
  end;
  perform set_config('request.jwt.claims', v_recepcion, true);

  raise notice 'HU-06 OK';
end;
$$;

rollback;
