-- HU-05. Consulta de horarios disponibles.
-- Crea tabla turno mínima (HU-06 otorgará turnos sobre ella) y RPC de disponibilidad.
-- Franjas: dia_semana ISO 1=lunes..7=domingo (igual que HU-02B).

create table if not exists public.turno (
  id_turno uuid primary key default gen_random_uuid(),
  id_profesional uuid not null references public.profesional (id_usuario),
  id_servicio uuid not null references public.servicio (id_servicio),
  id_paciente uuid references public.paciente (id_paciente),
  fecha date not null,
  hora_inicio time without time zone not null,
  hora_fin time without time zone not null,
  estado text not null default 'otorgado',
  creado timestamptz not null default now(),
  constraint turno_horas_validas check (
    hora_fin > hora_inicio
    and extract(second from hora_inicio) = 0
    and extract(second from hora_fin) = 0
  ),
  constraint turno_estado_valido check (estado in ('otorgado', 'cancelado', 'ausente'))
);

create index if not exists idx_turno_profesional_fecha
  on public.turno (id_profesional, fecha)
  where estado = 'otorgado';

alter table public.turno enable row level security;
revoke all on public.turno from public, anon, authenticated;

-- Solo lectura/ocupación para HU-05. El alta de turnos es HU-06.

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
          and t.estado = 'otorgado'
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

revoke all on function public.fn_consultar_disponibilidad(uuid, uuid, date) from public, anon;
grant execute on function public.fn_consultar_disponibilidad(uuid, uuid, date) to authenticated;
