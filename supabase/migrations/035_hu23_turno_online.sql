-- HU-23. Sacar turno online / Autogestión del paciente.
--
-- El paciente entra con su cuenta de Supabase Auth en /portal (aparte del sistema de gestión)
-- y saca, ve y cancela SUS turnos. Reglas:
--   * Quién es el paciente lo decide la base (fn_paciente_actual), nunca el request:
--       - la ficha cuyo id_paciente = auth.uid(), o
--       - la ficha activa cuyo mail_paciente (HU-04) coincide con el mail CONFIRMADO de la cuenta.
--     Si hay más de una ficha con ese mail, no se adivina: se pide ir a Recepción.
--     Un usuario de gestión activo (Gerente, Profesional, Mesa) no puede usar el portal.
--   * Disponibilidad: el mismo cálculo de HU-05/HU-33 (fn_horarios_del_dia: franjas, duración y
--     granularidad, ocupados, bloqueos, nada en el pasado) y la misma ventana de 30 días.
--   * Sacar turno: mismo lock por profesional + día y misma EXCLUDE que fn_otorgar_turno (HU-06).
--     Cobertura: una obra social ACTIVA del paciente o Particular. Prioridad siempre Normal (HU-20
--     la decide Recepción). Además, el paciente no puede tener dos turnos superpuestos.
--   * Cancelar: solo su turno, confirmado y que no empezó (igual que HU-10A), con motivo
--     'pedido_paciente'. No toca pagos (HU-14/HU-22).
--   * turno.origen ('recepcion' | 'online') deja registrado por dónde se sacó.
-- No modifica ninguna función existente. Las fn_paciente_* no devuelven nada clínico ni de pagos.
begin;

-- ---------- Origen del turno ----------
alter table public.turno
  add column if not exists origen text not null default 'recepcion';

alter table public.turno drop constraint if exists turno_origen_valido;
alter table public.turno
  add constraint turno_origen_valido check (origen in ('recepcion', 'online'));

-- ---------- Helper interno: el paciente de la sesión ----------
create or replace function public.fn_paciente_actual()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_mail text;
  v_confirmado timestamptz;
  v_ids uuid[];
  v_id uuid;
  v_activo boolean;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- El personal del centro usa el sistema de gestión, no el portal.
  if exists (
    select 1 from public.usuario u
    where u.id_usuario = v_uid
      and u.activo = true
      and u.rol_usuario in ('Gerente', 'Profesional', 'Mesa de Entradas')
  ) then
    raise exception 'El turno online es solo para pacientes. Usá el sistema de gestión';
  end if;

  select lower(btrim(au.email)), au.email_confirmed_at
  into v_mail, v_confirmado
  from auth.users au
  where au.id = v_uid;

  -- El mail solo vale si la cuenta lo confirmó (si no, cualquiera podría usar el de otro).
  select array_agg(p.id_paciente)
  into v_ids
  from public.paciente p
  where p.id_paciente = v_uid
     or (
       v_confirmado is not null
       and v_mail is not null
       and lower(btrim(p.mail_paciente)) = v_mail
     );

  if v_ids is null then
    raise exception 'No encontramos tu ficha de paciente. Pedile a Recepción que registre tu mail';
  end if;

  if array_length(v_ids, 1) > 1 then
    -- La ficha atada a la cuenta gana; si no, el mail es ambiguo.
    if v_uid = any (v_ids) then
      v_id := v_uid;
    else
      raise exception 'Hay más de una ficha de paciente con tu mail. Comunicate con Recepción';
    end if;
  else
    v_id := v_ids[1];
  end if;

  select p.activo into v_activo from public.paciente p where p.id_paciente = v_id;
  if not coalesce(v_activo, false) then
    raise exception 'Tu ficha de paciente está inactiva. Comunicate con el centro';
  end if;

  return v_id;
end;
$$;

-- ---------- Helper interno: un turno tal como lo ve el paciente ----------
-- Sin observaciones, órdenes, prioridad ni pagos.
create or replace function public.fn_paciente_turno_json(p_id_turno uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id_turno', t.id_turno,
    'fecha', t.fecha,
    'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
    'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
    'estado', t.estado,
    'origen', t.origen,
    'id_servicio', t.id_servicio,
    'nombre_servicio', s.nombre_servicio,
    'id_profesional', t.id_profesional,
    'nombre_profesional', u.nombre_usuario,
    'apellido_profesional', u.apellido_usuario,
    'cobertura', coalesce(o.nombre_obra_social, 'Particular'),
    'numero_afiliado', t.numero_afiliado,
    -- Mismo criterio que HU-10A: confirmado y todavía no empezó (hora de Argentina).
    'cancelable', t.estado = 'confirmado'
      and t.fecha + t.hora_inicio > timezone('America/Argentina/Buenos_Aires', now())
  )
  from public.turno t
  join public.servicio s on s.id_servicio = t.id_servicio
  join public.usuario u on u.id_usuario = t.id_profesional
  left join public.obra_social o on o.id_obra_social = t.id_obra_social
  where t.id_turno = p_id_turno;
$$;

-- ---------- Acceso al portal (login) ----------
-- Devuelve el paciente de la sesión y sus coberturas activas (para el paso de cobertura).
create or replace function public.fn_acceso_paciente()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.fn_paciente_actual();
begin
  return (
    select jsonb_build_object(
      'id_paciente', p.id_paciente,
      'nombre_paciente', p.nombre_paciente,
      'apellido_paciente', p.apellido_paciente,
      'obras_sociales', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id_obra_social', pos.id_obra_social,
            'nombre_obra_social', o.nombre_obra_social,
            'numero_afiliado', pos.numero_afiliado
          )
          order by o.nombre_obra_social
        )
        from public.paciente_obra_social pos
        join public.obra_social o on o.id_obra_social = pos.id_obra_social
        where pos.id_paciente = p.id_paciente
          and o.activo = true
      ), '[]'::jsonb)
    )
    from public.paciente p
    where p.id_paciente = v_id
  );
end;
$$;

-- ---------- Paso 1: servicios y profesionales que se pueden reservar ----------
-- Servicio activo + profesional activo que lo presta y tiene al menos una franja (HU-02B).
create or replace function public.fn_paciente_catalogo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_paciente_actual();

  return coalesce((
    select jsonb_agg(serv order by serv ->> 'nombre_servicio')
    from (
      select jsonb_build_object(
        'id_servicio', s.id_servicio,
        'nombre_servicio', s.nombre_servicio,
        'duracion_minutos', s.duracion_minutos,
        'precio_servicio', s.precio_servicio,
        'profesionales', jsonb_agg(
          jsonb_build_object(
            'id_profesional', u.id_usuario,
            'nombre_profesional', u.nombre_usuario,
            'apellido_profesional', u.apellido_usuario
          )
          order by u.apellido_usuario, u.nombre_usuario
        )
      ) as serv
      from public.servicio s
      join public.servicio_profesional sp on sp.id_servicio = s.id_servicio
      join public.profesional p on p.id_usuario = sp.id_usuario and p.activo = true
      join public.usuario u on u.id_usuario = p.id_usuario
        and u.activo = true
        and u.rol_usuario = 'Profesional'
      where s.activo = true
        and exists (
          select 1 from public.franja_profesional f where f.id_usuario = p.id_usuario
        )
      group by s.id_servicio, s.nombre_servicio, s.duracion_minutos, s.precio_servicio
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ---------- Paso 2: calendario de 30 días ----------
-- Misma forma que fn_consultar_disponibilidad_calendario (lo dibuja el mismo componente).
create or replace function public.fn_paciente_calendario(
  p_id_profesional uuid,
  p_id_servicio uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_dia date;
  v_disp jsonb;
  v_dias jsonb := '[]'::jsonb;
begin
  perform public.fn_paciente_actual();

  if p_id_profesional is null or p_id_servicio is null then
    raise exception 'Faltan campos';
  end if;

  for v_dia in
    select d::date from generate_series(v_hoy, v_hoy + 30, interval '1 day') d
  loop
    -- Valida profesional y servicio (si fallan, corta en el primer día).
    v_disp := public.fn_horarios_del_dia(p_id_profesional, p_id_servicio, v_dia);
    v_dias := v_dias || jsonb_build_array(jsonb_build_object(
      'fecha', v_dia,
      'libres', jsonb_array_length(v_disp -> 'horarios')
    ));
  end loop;

  return jsonb_build_object(
    'desde', v_hoy,
    'hasta', v_hoy + 30,
    'nombre_profesional', v_disp ->> 'nombre_profesional',
    'apellido_profesional', v_disp ->> 'apellido_profesional',
    'nombre_servicio', v_disp ->> 'nombre_servicio',
    'duracion_minutos', (v_disp ->> 'duracion_minutos')::integer,
    'dias', v_dias
  );
end;
$$;

-- ---------- Paso 2: horarios libres de un día ----------
create or replace function public.fn_paciente_horarios(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_disp jsonb;
begin
  perform public.fn_paciente_actual();

  if p_id_profesional is null or p_id_servicio is null or p_fecha is null then
    raise exception 'Faltan campos';
  end if;

  if p_fecha < v_hoy then
    raise exception 'No se puede consultar una fecha pasada';
  end if;

  if p_fecha > v_hoy + 30 then
    raise exception 'Solo se pueden sacar turnos hasta 30 días desde hoy';
  end if;

  v_disp := public.fn_horarios_del_dia(p_id_profesional, p_id_servicio, p_fecha);

  -- Sin el detalle interno (franja completa y motivos de bloqueo por horario). El 'mensaje'
  -- de fn_horarios_del_dia trae el motivo del bloqueo ("bloqueado: Licencia ..."), así que
  -- se reemplaza por uno genérico.
  return (v_disp - 'en_franja' - 'bloqueados')
    || jsonb_build_object(
      'mensaje',
      case
        when jsonb_array_length(v_disp -> 'horarios') = 0 then 'No hay horarios libres para ese día'
        else null
      end
    );
end;
$$;

-- ---------- Paso 3: confirmar ----------
create or replace function public.fn_paciente_sacar_turno(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_hora time,
  p_id_obra_social uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paciente uuid := public.fn_paciente_actual();
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_ahora timestamp := timezone('America/Argentina/Buenos_Aires', now());
  v_afiliado text;
  v_disp jsonb;
  v_duracion integer;
  v_id uuid;
begin
  if p_id_profesional is null
    or p_id_servicio is null
    or p_fecha is null
    or p_hora is null then
    raise exception 'Faltan campos';
  end if;

  if p_fecha + p_hora < v_ahora then
    raise exception 'No se pueden sacar turnos en una fecha u hora pasada';
  end if;

  if p_fecha > v_hoy + 30 then
    raise exception 'Solo se pueden sacar turnos hasta 30 días desde hoy';
  end if;

  -- Cobertura: una obra social activa del paciente, o null = Particular.
  if p_id_obra_social is not null then
    select pos.numero_afiliado into v_afiliado
    from public.paciente_obra_social pos
    join public.obra_social o on o.id_obra_social = pos.id_obra_social and o.activo = true
    where pos.id_paciente = v_paciente
      and pos.id_obra_social = p_id_obra_social;

    if v_afiliado is null then
      raise exception 'La obra social elegida no es una de tus coberturas activas';
    end if;
  end if;

  -- De a una las reservas del mismo paciente: así dos pestañas (aunque sean con profesionales
  -- distintos) no pasan las dos el chequeo de "Ya tenés un turno en ese horario". Este lock
  -- solo lo toma el portal y siempre antes que el del profesional, así que no hay deadlock.
  perform pg_advisory_xact_lock(
    hashtextextended('paciente:' || v_paciente::text, 0)
  );

  -- Igual que fn_otorgar_turno: evita confirmar contra una agenda que HU-03 está cambiando
  -- y atiende de a una las confirmaciones del mismo profesional y día.
  perform 1 from public.profesional where id_usuario = p_id_profesional for update;
  perform pg_advisory_xact_lock(
    hashtextextended(p_id_profesional::text || p_fecha::text, 0)
  );

  v_disp := public.fn_horarios_del_dia(p_id_profesional, p_id_servicio, p_fecha);

  if not ((v_disp -> 'horarios') ? to_char(p_hora, 'HH24:MI')) then
    raise exception 'El horario seleccionado ya no está disponible';
  end if;

  v_duracion := (v_disp ->> 'duracion_minutos')::integer;

  -- El paciente no puede estar en dos turnos a la vez (con cualquier profesional).
  if exists (
    select 1 from public.turno t
    where t.id_paciente = v_paciente
      and t.fecha = p_fecha
      and t.estado = 'confirmado'
      and t.hora_inicio < p_hora + make_interval(mins => v_duracion)
      and t.hora_fin > p_hora
  ) then
    raise exception 'Ya tenés un turno en ese horario';
  end if;

  begin
    insert into public.turno (
      id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin,
      estado, id_obra_social, numero_afiliado, prioridad, origen
    )
    values (
      p_id_profesional, p_id_servicio, v_paciente, p_fecha, p_hora,
      p_hora + make_interval(mins => v_duracion),
      'confirmado', p_id_obra_social, v_afiliado, 'normal', 'online'
    )
    returning id_turno into v_id;
  exception when exclusion_violation then
    -- Última defensa: la restricción EXCLUDE detectó un solapamiento.
    raise exception 'El horario seleccionado ya no está disponible';
  end;

  return public.fn_paciente_turno_json(v_id);
end;
$$;

-- ---------- Mis turnos ----------
-- Próximos (confirmados que no terminaron) y el historial (últimos 20 del resto).
create or replace function public.fn_paciente_mis_turnos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_paciente uuid := public.fn_paciente_actual();
  v_ahora timestamp := timezone('America/Argentina/Buenos_Aires', now());
begin
  return jsonb_build_object(
    'proximos', coalesce((
      select jsonb_agg(public.fn_paciente_turno_json(t.id_turno) order by t.fecha, t.hora_inicio)
      from public.turno t
      where t.id_paciente = v_paciente
        and t.estado = 'confirmado'
        and t.fecha + t.hora_fin > v_ahora
    ), '[]'::jsonb),
    'anteriores', coalesce((
      select jsonb_agg(public.fn_paciente_turno_json(x.id_turno) order by x.fecha desc, x.hora_inicio desc)
      from (
        select t.id_turno, t.fecha, t.hora_inicio
        from public.turno t
        where t.id_paciente = v_paciente
          and not (t.estado = 'confirmado' and t.fecha + t.hora_fin > v_ahora)
        order by t.fecha desc, t.hora_inicio desc
        limit 20
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- Cancelar un turno propio ----------
create or replace function public.fn_paciente_cancelar_turno(p_id_turno uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paciente uuid := public.fn_paciente_actual();
  v_profesional uuid;
  v_fecha date;
  v_turno record;
begin
  if p_id_turno is null then
    raise exception 'Faltan campos';
  end if;

  -- Mismo mensaje si no existe o es de otro paciente (no se revela nada).
  select t.id_profesional, t.fecha into v_profesional, v_fecha
  from public.turno t
  where t.id_turno = p_id_turno and t.id_paciente = v_paciente;

  if v_profesional is null then
    raise exception 'El turno no existe o no es tuyo';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_profesional::text || v_fecha::text, 0)
  );

  select t.estado, t.fecha, t.hora_inicio into v_turno
  from public.turno t
  where t.id_turno = p_id_turno
  for update;

  if v_turno.estado <> 'confirmado' then
    raise exception 'Solo se puede cancelar un turno confirmado';
  end if;

  if v_turno.fecha + v_turno.hora_inicio <= timezone('America/Argentina/Buenos_Aires', now()) then
    raise exception 'El turno ya empezó; comunicate con Recepción';
  end if;

  update public.turno
  set estado = 'cancelado',
      motivo_cancelacion = 'pedido_paciente',
      detalle_cancelacion = 'Cancelado por el paciente desde el turno online',
      cancelado_en = now(),
      -- cancelado_por apunta a usuario: solo se completa si la cuenta tiene fila ahí.
      cancelado_por = (select u.id_usuario from public.usuario u where u.id_usuario = auth.uid())
  where id_turno = p_id_turno;

  return public.fn_paciente_turno_json(p_id_turno);
end;
$$;

-- ---------- Permisos ----------
-- Internas: nadie las llama por RPC.
revoke all on function public.fn_paciente_actual() from public, anon, authenticated;
revoke all on function public.fn_paciente_turno_json(uuid) from public, anon, authenticated;

revoke all on function public.fn_acceso_paciente() from public, anon;
revoke all on function public.fn_paciente_catalogo() from public, anon;
revoke all on function public.fn_paciente_calendario(uuid, uuid) from public, anon;
revoke all on function public.fn_paciente_horarios(uuid, uuid, date) from public, anon;
revoke all on function public.fn_paciente_sacar_turno(uuid, uuid, date, time, uuid) from public, anon;
revoke all on function public.fn_paciente_mis_turnos() from public, anon;
revoke all on function public.fn_paciente_cancelar_turno(uuid) from public, anon;

grant execute on function public.fn_acceso_paciente() to authenticated;
grant execute on function public.fn_paciente_catalogo() to authenticated;
grant execute on function public.fn_paciente_calendario(uuid, uuid) to authenticated;
grant execute on function public.fn_paciente_horarios(uuid, uuid, date) to authenticated;
grant execute on function public.fn_paciente_sacar_turno(uuid, uuid, date, time, uuid) to authenticated;
grant execute on function public.fn_paciente_mis_turnos() to authenticated;
grant execute on function public.fn_paciente_cancelar_turno(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
