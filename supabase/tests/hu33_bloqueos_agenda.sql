-- Pruebas HU-33: bloqueos de agenda (feriado del centro, licencia, bloqueo parcial,
-- turnos afectados, eliminar, otorgar sobre un horario bloqueado, permisos y ocupación).
-- Requiere 031_hu33_bloqueos_agenda.sql. Todo se revierte al final.
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_prof uuid;
  v_servicio uuid;
  v_paciente uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_fecha date;
  v_disp jsonb;
  v_slot text;
  v_slot2 text;
  v_res jsonb;
  v_bloqueo uuid;
  v_turno uuid;
  v_antes integer;
  v_despues integer;
  v_cant integer;
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';

  -- Profesional activo con servicio y una fecha con franja dentro de la ventana de 30 días.
  select sp.id_usuario, sp.id_servicio, d.f::date
    into v_prof, v_servicio, v_fecha
  from public.servicio_profesional sp
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo
  join public.profesional p on p.id_usuario = sp.id_usuario and p.activo
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo and u.rol_usuario = 'Profesional'
  cross join generate_series(v_hoy + 2, v_hoy + 28, interval '1 day') d(f)
  where exists (
    select 1 from public.franja_profesional f
    where f.id_usuario = sp.id_usuario and f.dia_semana = extract(isodow from d.f)::integer
  )
  order by d.f, sp.id_usuario
  limit 1;

  if v_gerente is null or v_mesa is null or v_prof is null then
    raise exception 'Faltan datos de prueba (Gerente, Mesa o profesional con franjas)';
  end if;

  -- Sin turnos ese día para que los horarios sean predecibles.
  delete from public.turno where id_profesional = v_prof and fecha = v_fecha;

  insert into public.paciente (nombre_paciente, apellido_paciente, dni_paciente)
  values ('HU33', 'Prueba', floor(random() * 10000000)::bigint + 70000000)
  returning id_paciente into v_paciente;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_disp := public.fn_consultar_disponibilidad(v_prof, v_servicio, v_fecha);
  if jsonb_array_length(v_disp -> 'horarios') < 2 then
    raise exception 'FALLA: el día de prueba necesita al menos dos horarios libres: %', v_disp;
  end if;
  v_slot := v_disp -> 'horarios' ->> 0;
  v_slot2 := v_disp -> 'horarios' ->> 1;

  -- 1. Solo consultar no guarda.
  v_res := public.fn_crear_bloqueo(null, v_fecha, v_fecha, null, null, 'Feriado de prueba', true);
  if (v_res ->> 'guardado')::boolean or v_res ->> 'id_bloqueo' is not null then
    raise exception 'FALLA: solo consultar guardó el bloqueo: %', v_res;
  end if;

  -- 2. Feriado de todo el centro: no se ofrece ningún horario y el mensaje dice el motivo.
  v_res := public.fn_crear_bloqueo(null, v_fecha, v_fecha, null, null, 'Feriado de prueba');
  v_bloqueo := (v_res ->> 'id_bloqueo')::uuid;
  v_disp := public.fn_consultar_disponibilidad(v_prof, v_servicio, v_fecha);
  if jsonb_array_length(v_disp -> 'horarios') <> 0
     or v_disp ->> 'mensaje' not like '%Feriado de prueba%' then
    raise exception 'FALLA: el feriado del centro sigue ofreciendo horarios: %', v_disp;
  end if;

  -- 3. Otorgar sobre un horario bloqueado se rechaza.
  begin
    perform public.fn_otorgar_turno(v_paciente, v_prof, v_servicio, v_fecha, v_slot::time, null, 'normal');
    raise exception 'FALLA: se otorgó un turno en un día bloqueado';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%ya no está disponible%' then raise; end if;
  end;

  -- 4. Eliminar un bloqueo que no empezó devuelve los horarios.
  perform public.fn_eliminar_bloqueo(v_bloqueo);
  v_disp := public.fn_consultar_disponibilidad(v_prof, v_servicio, v_fecha);
  if not (v_disp -> 'horarios') ? v_slot then
    raise exception 'FALLA: eliminar el bloqueo no devolvió los horarios: %', v_disp;
  end if;

  -- 5. Licencia parcial del profesional: bloquea solo el primer horario.
  v_res := public.fn_crear_bloqueo(
    v_prof, v_fecha, v_fecha, v_slot::time, v_slot::time + interval '1 minute', 'Licencia parcial'
  );
  v_disp := public.fn_consultar_disponibilidad(v_prof, v_servicio, v_fecha);
  if (v_disp -> 'horarios') ? v_slot or not (v_disp -> 'horarios') ? v_slot2 then
    raise exception 'FALLA: el bloqueo parcial no respeta el horario: %', v_disp;
  end if;
  perform public.fn_eliminar_bloqueo((v_res ->> 'id_bloqueo')::uuid);

  -- 6. Turnos afectados: se informan, se guarda igual y el turno sigue confirmado.
  v_res := public.fn_otorgar_turno(v_paciente, v_prof, v_servicio, v_fecha, v_slot::time, null, 'normal');
  v_turno := coalesce((v_res ->> 'id_turno')::uuid, (v_res -> 0 ->> 'id_turno')::uuid);
  v_res := public.fn_crear_bloqueo(v_prof, v_fecha, v_fecha, null, null, 'Vacaciones', true);
  if (v_res ->> 'cantidad_afectados')::int <> 1
     or v_res -> 'turnos_afectados' -> 0 ->> 'id_turno' <> v_turno::text then
    raise exception 'FALLA: no informa el turno afectado: %', v_res;
  end if;
  v_res := public.fn_crear_bloqueo(v_prof, v_fecha, v_fecha, null, null, 'Vacaciones');
  if not (v_res ->> 'guardado')::boolean or (v_res ->> 'cantidad_afectados')::int <> 1 then
    raise exception 'FALLA: no guardó con turnos afectados: %', v_res;
  end if;
  reset role;
  if (select estado from public.turno where id_turno = v_turno) <> 'confirmado' then
    raise exception 'FALLA: el bloqueo cambió el estado del turno afectado';
  end if;
  set local role authenticated;

  -- 7. Listado del Gerente: alcance, horario y quién lo cargó.
  select count(*) into v_cant
  from jsonb_array_elements(public.fn_listar_bloqueos()) b
  where b ->> 'motivo' = 'Vacaciones'
    and b ->> 'alcance' = 'profesional'
    and (b ->> 'dia_completo')::boolean
    and b ->> 'nombre_creador' is not null;
  if v_cant <> 1 then
    raise exception 'FALLA: el listado no muestra el bloqueo';
  end if;

  -- 8. Validaciones.
  begin
    perform public.fn_crear_bloqueo(null, v_hoy - 1, v_hoy - 1, null, null, 'Pasado');
    raise exception 'FALLA: aceptó una fecha pasada';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%fechas pasadas%' then raise; end if;
  end;
  begin
    perform public.fn_crear_bloqueo(null, v_fecha, v_fecha - 1, null, null, 'Al revés');
    raise exception 'FALLA: aceptó hasta < desde';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%no puede ser anterior%' then raise; end if;
  end;
  begin
    perform public.fn_crear_bloqueo(null, v_fecha, v_fecha + 90, null, null, 'Largo');
    raise exception 'FALLA: aceptó más de 90 días';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%90 días%' then raise; end if;
  end;
  begin
    perform public.fn_crear_bloqueo(null, v_fecha, v_fecha, '12:00', '11:00', 'Horas');
    raise exception 'FALLA: aceptó hora fin anterior';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%posterior a la de inicio%' then raise; end if;
  end;
  begin
    perform public.fn_crear_bloqueo(null, v_fecha, v_fecha, null, null, '   ');
    raise exception 'FALLA: aceptó motivo vacío';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%motivo%' then raise; end if;
  end;

  -- 9. Un bloqueo que ya empezó no se elimina.
  reset role;
  insert into public.bloqueo_agenda (id_profesional, fecha_desde, fecha_hasta, motivo, creado_por)
  values (v_prof, v_hoy, v_hoy, 'Ya empezó', v_gerente)
  returning id_bloqueo into v_bloqueo;
  set local role authenticated;
  begin
    perform public.fn_eliminar_bloqueo(v_bloqueo);
    raise exception 'FALLA: eliminó un bloqueo que ya empezó';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%ya empezó%' then raise; end if;
  end;

  -- 10. Ocupación (HU-18): el día bloqueado no suma minutos disponibles.
  reset role;
  delete from public.bloqueo_agenda where id_profesional = v_prof and fecha_desde = v_fecha;
  set local role authenticated;
  select (p ->> 'minutos_disponibles')::int into v_antes
  from jsonb_array_elements(public.fn_consultar_dashboard_operativo(v_fecha, v_fecha) -> 'profesionales') p
  where p ->> 'id_profesional' = v_prof::text;
  perform public.fn_crear_bloqueo(v_prof, v_fecha, v_fecha, null, null, 'Licencia');
  select (p ->> 'minutos_disponibles')::int into v_despues
  from jsonb_array_elements(public.fn_consultar_dashboard_operativo(v_fecha, v_fecha) -> 'profesionales') p
  where p ->> 'id_profesional' = v_prof::text;
  if v_antes is null or v_antes = 0 or v_despues <> 0 then
    raise exception 'FALLA: la ocupación no descuenta el bloqueo (antes %, después %)', v_antes, v_despues;
  end if;

  -- 11. Mesa no crea ni lista, pero ve los bloqueos en la agenda.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_crear_bloqueo(null, v_fecha, v_fecha, null, null, 'Mesa');
    raise exception 'FALLA: Mesa creó un bloqueo';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%permisos%' then raise; end if;
  end;
  if jsonb_array_length(public.fn_consultar_bloqueos_agenda(v_prof, v_fecha, v_fecha)) <> 1 then
    raise exception 'FALLA: Mesa no ve el bloqueo en la agenda';
  end if;

  -- 12. El Profesional solo ve los bloqueos de su propia agenda.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  if jsonb_array_length(public.fn_consultar_bloqueos_agenda(v_prof, v_fecha, v_fecha)) <> 1 then
    raise exception 'FALLA: el Profesional no ve su bloqueo';
  end if;
  begin
    perform public.fn_consultar_bloqueos_agenda(gen_random_uuid(), v_fecha, v_fecha);
    raise exception 'FALLA: el Profesional vio la agenda de otro';
  exception when others then
    if sqlerrm like 'FALLA%' or sqlerrm not like '%propia agenda%' then raise; end if;
  end;

  raise notice 'HU-33: todas las pruebas pasaron';
end;
$$;

rollback;
