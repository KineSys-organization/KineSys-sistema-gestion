-- Pruebas HU-20 (prioridad o urgencia del turno). Todo se revierte al final.
-- Requiere la migración 027_hu20_prioridad_turno.sql aplicada.
--
-- Cuentas: Mesa carlaperez@ y el primer Profesional activo con servicio. Los turnos se
-- insertan como postgres (salvo el que se otorga, que usa un horario libre de verdad).
begin;

do $$
declare
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_pac uuid;
  v_futuro uuid;
  v_pasado uuid;
  v_cancelado uuid;
  v_res jsonb;
  v_n integer;
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('fn_otorgar_turno', 'fn_buscar_turnos');
  if v_n <> 2 then
    raise exception 'FALLA: hay % versiones de fn_otorgar_turno / fn_buscar_turnos', v_n;
  end if;

  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';

  select p.id_usuario, sp.id_servicio
  into v_prof, v_serv
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo = true
    and u.rol_usuario = 'Profesional'
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo = true
  where p.activo = true
  order by u.mail_usuario
  limit 1;

  if v_mesa is null or v_prof is null then
    raise exception 'Faltan cuentas de prueba';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pac := public.fn_registrar_paciente(
    'Ana', 'TestHU20', 99020101, date '1985-03-15', '1100000020', 'ana.hu20.sql@test.com', '[]'::jsonb
  );
  reset role;

  -- Los turnos existentes / nuevos sin prioridad quedan en Normal (default).
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy + 20, time '00:05', time '00:10', 'confirmado')
  returning id_turno into v_futuro;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy - 3, time '00:05', time '00:10', 'confirmado')
  returning id_turno into v_pasado;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado, motivo_cancelacion)
  values (v_prof, v_serv, v_pac, v_hoy + 21, time '00:05', time '00:10', 'cancelado', 'otro')
  returning id_turno into v_cancelado;

  if (select prioridad from public.turno where id_turno = v_futuro) <> 'normal' then
    raise exception 'FALLA: el default no es normal';
  end if;

  -- ============ Mesa de Entradas ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_res := public.fn_cambiar_prioridad_turno(v_futuro, 'Urgente', '  Dolor agudo  ');
  if v_res ->> 'prioridad' <> 'urgente' or v_res ->> 'prioridad_nota' <> 'Dolor agudo'
    or not (v_res ->> 'prioridad_editable')::boolean then
    raise exception 'FALLA: el cambio de prioridad quedó mal: %', v_res;
  end if;

  begin
    perform public.fn_cambiar_prioridad_turno(v_futuro, 'altísima', null);
    raise exception 'FALLA: aceptó una prioridad inválida';
  exception when others then
    if sqlerrm <> 'La prioridad no es válida' then raise; end if;
  end;
  begin
    perform public.fn_cambiar_prioridad_turno(v_futuro, 'alta', repeat('n', 201));
    raise exception 'FALLA: aceptó una nota de más de 200';
  exception when others then
    if sqlerrm <> 'La nota no puede superar los 200 caracteres' then raise; end if;
  end;
  begin
    perform public.fn_cambiar_prioridad_turno(v_pasado, 'alta', null);
    raise exception 'FALLA: cambió la prioridad de un turno pasado';
  exception when others then
    if sqlerrm <> 'El turno ya pasó; no se puede cambiar la prioridad' then raise; end if;
  end;
  begin
    perform public.fn_cambiar_prioridad_turno(v_cancelado, 'alta', null);
    raise exception 'FALLA: cambió la prioridad de un turno cancelado';
  exception when others then
    if sqlerrm <> 'Solo se puede cambiar la prioridad de un turno confirmado' then raise; end if;
  end;

  -- Se ve pero no se edita en un turno pasado.
  v_res := public.fn_obtener_turno(v_pasado);
  if v_res ->> 'prioridad' <> 'normal' or (v_res ->> 'prioridad_editable')::boolean then
    raise exception 'FALLA: el turno pasado figura editable';
  end if;

  -- Listado: filtro combinable y la prioridad en cada fila.
  v_res := public.fn_buscar_turnos('TestHU20', null, null, null, null, null, 1, 'urgente');
  if (v_res ->> 'total')::int <> 1 or v_res -> 'turnos' -> 0 ->> 'prioridad' <> 'urgente' then
    raise exception 'FALLA: el filtro Urgente no anduvo: %', v_res;
  end if;
  v_res := public.fn_buscar_turnos('TestHU20', null, null, null, null, 'confirmado', 1, 'normal');
  if (v_res ->> 'total')::int <> 1 then
    raise exception 'FALLA: filtro Normal + Confirmado no anduvo';
  end if;
  v_res := public.fn_buscar_turnos('TestHU20', null, null, null, null, null, 1, 'todas');
  if (v_res ->> 'total')::int <> 3 then
    raise exception 'FALLA: Todas no muestra todo';
  end if;
  begin
    perform public.fn_buscar_turnos(null, null, null, null, null, null, 1, 'x');
    raise exception 'FALLA: el listado aceptó una prioridad inválida';
  exception when others then
    if sqlerrm <> 'La prioridad no es válida' then raise; end if;
  end;

  -- Agenda: devuelve la prioridad y no cambia el orden por horario.
  v_res := public.fn_consultar_agenda_profesional(v_prof, v_hoy + 20);
  if not exists (
    select 1 from jsonb_array_elements(v_res) e
    where e ->> 'id_turno' = v_futuro::text and e ->> 'prioridad' = 'urgente'
  ) then
    raise exception 'FALLA: la agenda no trae la prioridad';
  end if;

  -- Repetir (HU-25): los turnos nuevos copian la prioridad.
  v_res := public.fn_turno_repetir_confirmar(v_futuro, 1);
  if jsonb_array_length(v_res -> 'creados') = 1 and (
    select prioridad from public.turno
    where id_turno = (v_res -> 'creados' -> 0 ->> 'id_turno')::uuid
  ) <> 'urgente' then
    raise exception 'FALLA: la repetición no copió la prioridad';
  end if;

  -- Otorgar con prioridad inválida: rechazo antes de insertar.
  begin
    perform public.fn_otorgar_turno(v_pac, v_prof, v_serv, v_hoy + 1, time '10:00', null, 'muy alta');
    raise exception 'FALLA: otorgó con prioridad inválida';
  exception when others then
    if sqlerrm <> 'La prioridad no es válida' then raise; end if;
  end;

  -- ============ Profesional: la ve, no la cambia ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  v_res := public.fn_obtener_turno(v_futuro);
  if v_res ->> 'prioridad' <> 'urgente' then
    raise exception 'FALLA: el profesional no ve la prioridad';
  end if;
  begin
    perform public.fn_cambiar_prioridad_turno(v_futuro, 'normal', null);
    raise exception 'FALLA: el profesional cambió la prioridad';
  exception when others then
    if sqlerrm <> 'No tenés permisos para realizar esta acción' then raise; end if;
  end;

  reset role;

  -- Reprogramar solo toca fecha/horas: la prioridad sigue igual.
  update public.turno set fecha = v_hoy + 22 where id_turno = v_futuro;
  if (select prioridad from public.turno where id_turno = v_futuro) <> 'urgente' then
    raise exception 'FALLA: mover el turno cambió la prioridad';
  end if;

  begin
    update public.turno set prioridad = 'x' where id_turno = v_futuro;
    raise exception 'FALLA: la tabla aceptó una prioridad inválida';
  exception when check_violation then null;
  end;

  raise notice 'HU-20: todas las pruebas pasaron';
end;
$$;

rollback;
