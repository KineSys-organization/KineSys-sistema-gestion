-- Pruebas HU-10A (cancelar turno). Todo se revierte al final.
-- Requiere la migración 009_hu10a_cancelar_turno.sql aplicada.
--
-- Simula los roles con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
-- Cuentas: Mesa de Entradas carlaperez@ y el primer Profesional activo.
-- Necesita un profesional activo con franja y servicio (HU-02A/02B) con 2 horarios libres.
begin;

do $$
declare
  v_mesa uuid;
  v_prof_usuario uuid;
  v_prof uuid;
  v_serv uuid;
  v_dia integer;
  v_fecha date;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_disp jsonb;
  v_hora time;
  v_pac1 uuid;
  v_pac2 uuid;
  v_turno jsonb;
  v_otro jsonb;
  v_pasado uuid;
  v_agenda jsonb;
  v_err text;
begin
  -- ============ Datos de base (como postgres) ============
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select u.id_usuario into v_prof_usuario
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo = true
  order by u.mail_usuario
  limit 1;

  if v_mesa is null or v_prof_usuario is null then
    raise exception 'Faltan cuentas de prueba (Mesa de Entradas o Profesional activo)';
  end if;

  -- Profesional activo con franja y servicio asociado.
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

  -- ============ Sesión de Mesa de Entradas ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  if not public.fn_es_recepcion() then
    raise exception 'carlaperez@ tendría que ser Mesa de Entradas activa';
  end if;

  v_disp := public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha);
  if jsonb_array_length(v_disp -> 'horarios') < 1 then
    raise exception 'Se necesita al menos un horario libre para probar';
  end if;
  v_hora := (v_disp -> 'horarios' ->> 0)::time;

  v_pac1 := public.fn_registrar_paciente(
    'Ana', 'TestHU10A', 99010101, date '1990-05-10',
    '1100000010', 'ana.hu10a.sql@test.com', '[]'::jsonb
  );
  v_pac2 := public.fn_registrar_paciente(
    'Beto', 'TestHU10A', 99010102, date '1985-03-20',
    '1100000011', 'beto.hu10a.sql@test.com', '[]'::jsonb
  );

  v_turno := public.fn_otorgar_turno(v_pac1, v_prof, v_serv, v_fecha, v_hora, null);
  if (v_turno ->> 'cancelable')::boolean is not true then
    raise exception 'FALLA: un turno confirmado futuro tendría que ser cancelable';
  end if;

  -- El horario quedó ocupado.
  v_disp := public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha);
  if (v_disp -> 'horarios') ? to_char(v_hora, 'HH24:MI') then
    raise exception 'FALLA: el horario otorgado sigue figurando libre';
  end if;

  -- ---------- CA5: sin motivo se rechaza ----------
  begin
    perform public.fn_cancelar_turno((v_turno ->> 'id_turno')::uuid, null, null);
    raise exception 'FALLA: canceló sin motivo (null)';
  exception when others then
    if sqlerrm <> 'Tenés que indicar el motivo de la cancelación' then raise; end if;
  end;

  begin
    perform public.fn_cancelar_turno((v_turno ->> 'id_turno')::uuid, '   ', null);
    raise exception 'FALLA: canceló con motivo vacío';
  exception when others then
    if sqlerrm <> 'Tenés que indicar el motivo de la cancelación' then raise; end if;
  end;

  -- Motivo fuera de la lista y detalle demasiado largo.
  begin
    perform public.fn_cancelar_turno((v_turno ->> 'id_turno')::uuid, 'porque si', null);
    raise exception 'FALLA: aceptó un motivo inválido';
  exception when others then
    if sqlerrm <> 'El motivo de cancelación no es válido' then raise; end if;
  end;

  begin
    perform public.fn_cancelar_turno((v_turno ->> 'id_turno')::uuid, 'otro', repeat('x', 201));
    raise exception 'FALLA: aceptó un detalle de más de 200 caracteres';
  exception when others then
    if sqlerrm <> 'El detalle no puede superar los 200 caracteres' then raise; end if;
  end;

  -- Turno inexistente.
  begin
    perform public.fn_cancelar_turno(gen_random_uuid(), 'otro', null);
    raise exception 'FALLA: canceló un turno inexistente';
  exception when others then
    if sqlerrm <> 'El turno no existe' then raise; end if;
  end;

  -- ---------- CA1: cancelar con motivo libera el horario ----------
  v_turno := public.fn_cancelar_turno(
    (v_turno ->> 'id_turno')::uuid, 'pedido_paciente', '  Viaja por trabajo  '
  );

  if v_turno ->> 'estado' <> 'cancelado'
    or v_turno ->> 'motivo_cancelacion' <> 'pedido_paciente'
    or v_turno ->> 'detalle_cancelacion' <> 'Viaja por trabajo'
    or v_turno ->> 'cancelado_en' is null
    or (v_turno ->> 'cancelable')::boolean then
    raise exception 'FALLA: el turno cancelado quedó mal: %', v_turno;
  end if;

  v_disp := public.fn_consultar_disponibilidad(v_prof, v_serv, v_fecha);
  if not ((v_disp -> 'horarios') ? to_char(v_hora, 'HH24:MI')) then
    raise exception 'FALLA: el horario cancelado no volvió a figurar libre';
  end if;

  -- ---------- CA2: la agenda lo muestra cancelado y el horario se puede volver a otorgar ----------
  v_otro := public.fn_otorgar_turno(v_pac2, v_prof, v_serv, v_fecha, v_hora, null);
  if v_otro ->> 'estado' <> 'confirmado' then
    raise exception 'FALLA: no se pudo otorgar el horario liberado';
  end if;

  v_agenda := public.fn_consultar_agenda_profesional(v_prof, v_fecha);
  if not exists (
    select 1 from jsonb_array_elements(v_agenda) e
    where e ->> 'id_turno' = v_turno ->> 'id_turno'
      and e ->> 'estado' = 'cancelado'
      and e ->> 'motivo_cancelacion' = 'pedido_paciente'
  ) then
    raise exception 'FALLA: la agenda no muestra el turno cancelado';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_agenda) e
    where e ->> 'id_turno' = v_otro ->> 'id_turno'
      and e ->> 'estado' = 'confirmado'
  ) then
    raise exception 'FALLA: la agenda no muestra el turno nuevo en el horario liberado';
  end if;

  -- ---------- CA3: cancelar de nuevo se impide ----------
  begin
    perform public.fn_cancelar_turno((v_turno ->> 'id_turno')::uuid, 'otro', null);
    raise exception 'FALLA: canceló dos veces el mismo turno';
  exception when others then
    if sqlerrm <> 'El turno ya está cancelado' then raise; end if;
  end;

  -- ---------- CA4: turno pasado (se inserta directo, como postgres) ----------
  reset role;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac1, v_hoy - 400, time '03:00', time '03:30', 'confirmado')
  returning id_turno into v_pasado;
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);

  if (public.fn_obtener_turno(v_pasado) ->> 'cancelable')::boolean then
    raise exception 'FALLA: un turno pasado figura como cancelable';
  end if;

  begin
    perform public.fn_cancelar_turno(v_pasado, 'otro', null);
    raise exception 'FALLA: canceló un turno pasado';
  exception when others then
    if sqlerrm <> 'El turno ya pasó; corresponde marcarlo como Ausente' then raise; end if;
  end;

  -- ---------- Profesional: sin permiso ----------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_usuario, 'role', 'authenticated')::text, true);

  begin
    perform public.fn_cancelar_turno((v_otro ->> 'id_turno')::uuid, 'otro', null);
    raise exception 'FALLA: un Profesional pudo cancelar';
  exception when others then
    if sqlerrm <> 'No tenés permiso para cancelar turnos' then raise; end if;
  end;

  reset role;

  -- El turno cancelado sigue existiendo (no se borra).
  if not exists (
    select 1 from public.turno
    where id_turno = (v_turno ->> 'id_turno')::uuid and estado = 'cancelado'
  ) then
    raise exception 'FALLA: el turno cancelado no se conservó';
  end if;

  raise notice 'HU-10A: todas las pruebas pasaron';
end;
$$;

rollback;
