-- HU-06. Otorgar turno a un paciente.
-- Extiende la tabla turno de HU-05: cobertura elegida y estado 'confirmado'.
-- El solapamiento se revalida al confirmar (lock + fn_consultar_disponibilidad)
-- y la restricción EXCLUDE es la última defensa si dos confirmaciones compiten.
begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

-- Cobertura con la que se atiende. null = Particular.
-- numero_afiliado se guarda como foto: si después editan al paciente, el turno no cambia.
alter table public.turno
  add column if not exists id_obra_social uuid references public.obra_social (id_obra_social),
  add column if not exists numero_afiliado text;

-- Estado: el criterio pide que el turno figure "Confirmado".
alter table public.turno drop constraint if exists turno_estado_valido;
update public.turno set estado = 'confirmado' where estado = 'otorgado';
alter table public.turno alter column estado set default 'confirmado';
alter table public.turno
  add constraint turno_estado_valido check (estado in ('confirmado', 'cancelado', 'ausente'));

drop index if exists public.idx_turno_profesional_fecha;
create index idx_turno_profesional_fecha
  on public.turno (id_profesional, fecha)
  where estado = 'confirmado';

-- Intervalos [inicio, fin): 09:00-09:45 y 09:45-10:30 son contiguos, no superpuestos.
alter table public.turno drop constraint if exists turno_sin_superposicion;
alter table public.turno
  add constraint turno_sin_superposicion exclude using gist (
    id_profesional with =,
    tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') with &&
  ) where (estado = 'confirmado');

-- HU-05 con el nuevo estado (único cambio: 'otorgado' -> 'confirmado').
create or replace function public.fn_consultar_disponibilidad(
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
  v_hoy date;
  v_ahora time;
  v_dia integer;
  v_duracion integer;
  v_paso integer;
  v_slots jsonb := '[]'::jsonb;
  v_franja record;
  v_inicio time;
  v_fin_slot time;
  v_ocupado boolean;
  v_nombre text;
  v_apellido text;
  v_servicio text;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar disponibilidad';
  end if;

  if p_id_profesional is null or p_id_servicio is null or p_fecha is null then
    raise exception 'Faltan campos';
  end if;

  v_hoy := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_ahora := (timezone('America/Argentina/Buenos_Aires', now()))::time;

  if p_fecha < v_hoy then
    raise exception 'No se puede consultar una fecha pasada';
  end if;

  if p_fecha > v_hoy + 30 then
    raise exception 'Solo se puede consultar disponibilidad hasta 30 días desde hoy';
  end if;

  -- Profesional activo + usuario activo + servicio asociado y activo
  select u.nombre_usuario, u.apellido_usuario
  into v_nombre, v_apellido
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario
  where p.id_usuario = p_id_profesional
    and p.activo = true
    and u.activo = true
    and u.rol_usuario = 'Profesional';

  if v_nombre is null then
    raise exception 'El profesional no existe o no está activo';
  end if;

  if not exists (
    select 1
    from public.servicio_profesional sp
    join public.servicio s on s.id_servicio = sp.id_servicio
    where sp.id_usuario = p_id_profesional
      and sp.id_servicio = p_id_servicio
      and s.activo = true
  ) then
    raise exception 'El servicio no está asociado a ese profesional o no está activo';
  end if;

  select s.nombre_servicio, s.duracion_minutos, s.granularidad_minutos
  into v_servicio, v_duracion, v_paso
  from public.servicio s
  where s.id_servicio = p_id_servicio;

  if v_duracion is null or v_duracion <= 0 then
    raise exception 'El servicio no tiene una duración válida';
  end if;

  if v_paso is null or v_paso <= 0 then
    v_paso := v_duracion;
  end if;

  -- ISO: lunes=1 .. domingo=7
  v_dia := extract(isodow from p_fecha)::integer;

  if not exists (
    select 1
    from public.franja_profesional f
    where f.id_usuario = p_id_profesional
      and f.dia_semana = v_dia
  ) then
    return jsonb_build_object(
      'fecha', p_fecha,
      'id_profesional', p_id_profesional,
      'nombre_profesional', v_nombre,
      'apellido_profesional', v_apellido,
      'id_servicio', p_id_servicio,
      'nombre_servicio', v_servicio,
      'duracion_minutos', v_duracion,
      'horarios', '[]'::jsonb,
      'mensaje', 'No hay horarios para esa fecha'
    );
  end if;

  for v_franja in
    select f.hora_inicio, f.hora_fin
    from public.franja_profesional f
    where f.id_usuario = p_id_profesional
      and f.dia_semana = v_dia
    order by f.hora_inicio
  loop
    v_inicio := v_franja.hora_inicio;

    while v_inicio + make_interval(mins => v_duracion) <= v_franja.hora_fin loop
      v_fin_slot := v_inicio + make_interval(mins => v_duracion);

      -- No ofrecer horarios pasados (solo el día de hoy)
      if p_fecha = v_hoy and v_inicio < v_ahora then
        v_inicio := v_inicio + make_interval(mins => v_paso);
        continue;
      end if;

      select exists (
        select 1
        from public.turno t
        where t.id_profesional = p_id_profesional
          and t.fecha = p_fecha
          and t.estado = 'confirmado'
          and t.hora_inicio < v_fin_slot
          and t.hora_fin > v_inicio
      ) into v_ocupado;

      if not v_ocupado then
        v_slots := v_slots || jsonb_build_array(to_char(v_inicio, 'HH24:MI'));
      end if;

      v_inicio := v_inicio + make_interval(mins => v_paso);
    end loop;
  end loop;

  return jsonb_build_object(
    'fecha', p_fecha,
    'id_profesional', p_id_profesional,
    'nombre_profesional', v_nombre,
    'apellido_profesional', v_apellido,
    'id_servicio', p_id_servicio,
    'nombre_servicio', v_servicio,
    'duracion_minutos', v_duracion,
    'horarios', v_slots,
    'mensaje', case
      when jsonb_array_length(v_slots) = 0 then 'No hay horarios para esa fecha'
      else null
    end
  );
end;
$$;

-- Detalle de un turno: sirve para el resumen y para consultar su estado.
create or replace function public.fn_obtener_turno(p_id_turno uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar turnos';
  end if;

  select jsonb_build_object(
    'id_turno', t.id_turno,
    'estado', t.estado,
    'fecha', t.fecha,
    'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
    'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
    'id_paciente', pa.id_paciente,
    'nombre_paciente', pa.nombre_paciente,
    'apellido_paciente', pa.apellido_paciente,
    'dni_paciente', pa.dni_paciente,
    'id_profesional', t.id_profesional,
    'nombre_profesional', u.nombre_usuario,
    'apellido_profesional', u.apellido_usuario,
    'id_servicio', t.id_servicio,
    'nombre_servicio', s.nombre_servicio,
    'id_obra_social', t.id_obra_social,
    'cobertura', coalesce(o.nombre_obra_social, 'Particular'),
    'numero_afiliado', t.numero_afiliado
  )
  into v_resultado
  from public.turno t
  join public.paciente pa on pa.id_paciente = t.id_paciente
  join public.usuario u on u.id_usuario = t.id_profesional
  join public.servicio s on s.id_servicio = t.id_servicio
  left join public.obra_social o on o.id_obra_social = t.id_obra_social
  where t.id_turno = p_id_turno;

  if v_resultado is null then
    raise exception 'El turno no existe';
  end if;

  return v_resultado;
end;
$$;

create or replace function public.fn_otorgar_turno(
  p_id_paciente uuid,
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
  v_ahora timestamp;
  v_afiliado text;
  v_disp jsonb;
  v_duracion integer;
  v_id uuid;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para otorgar turnos';
  end if;

  if p_id_paciente is null
    or p_id_profesional is null
    or p_id_servicio is null
    or p_fecha is null
    or p_hora is null then
    raise exception 'Faltan campos';
  end if;

  -- No se otorgan turnos en el pasado (hora local de Argentina, igual que HU-05).
  v_ahora := timezone('America/Argentina/Buenos_Aires', now());
  if p_fecha + p_hora < v_ahora then
    raise exception 'No se pueden otorgar turnos con fecha anterior a la actual';
  end if;

  if not exists (
    select 1 from public.paciente
    where id_paciente = p_id_paciente and activo = true
  ) then
    raise exception 'El paciente no existe o no está activo';
  end if;

  -- La cobertura tiene que ser una obra social del paciente (o null = Particular).
  if p_id_obra_social is not null then
    select pos.numero_afiliado into v_afiliado
    from public.paciente_obra_social pos
    where pos.id_paciente = p_id_paciente
      and pos.id_obra_social = p_id_obra_social;

    if v_afiliado is null then
      raise exception 'La obra social elegida no corresponde al paciente';
    end if;
  end if;

  -- Dos confirmaciones del mismo profesional y día se atienden de a una:
  -- la segunda espera acá y después ya ve el turno de la primera.
  perform pg_advisory_xact_lock(
    hashtextextended(p_id_profesional::text || p_fecha::text, 0)
  );

  -- Revalidación al confirmar: reutiliza HU-05 (profesional activo, servicio asociado,
  -- franja, granularidad, 30 días y ocupación). Si la hora no figura, ya no está libre.
  v_disp := public.fn_consultar_disponibilidad(p_id_profesional, p_id_servicio, p_fecha);

  if not ((v_disp -> 'horarios') ? to_char(p_hora, 'HH24:MI')) then
    raise exception 'El horario seleccionado ya no está disponible';
  end if;

  v_duracion := (v_disp ->> 'duracion_minutos')::integer;

  begin
    insert into public.turno (
      id_profesional,
      id_servicio,
      id_paciente,
      fecha,
      hora_inicio,
      hora_fin,
      estado,
      id_obra_social,
      numero_afiliado
    )
    values (
      p_id_profesional,
      p_id_servicio,
      p_id_paciente,
      p_fecha,
      p_hora,
      p_hora + make_interval(mins => v_duracion),
      'confirmado',
      p_id_obra_social,
      v_afiliado
    )
    returning id_turno into v_id;
  exception when exclusion_violation then
    -- Última defensa: la restricción EXCLUDE detectó un solapamiento.
    raise exception 'El horario seleccionado ya no está disponible';
  end;

  return public.fn_obtener_turno(v_id);
end;
$$;

revoke all on function public.fn_obtener_turno(uuid) from public, anon;
revoke all on function public.fn_otorgar_turno(uuid, uuid, uuid, date, time, uuid) from public, anon;

grant execute on function public.fn_obtener_turno(uuid) to authenticated;
grant execute on function public.fn_otorgar_turno(uuid, uuid, uuid, date, time, uuid) to authenticated;

commit;
