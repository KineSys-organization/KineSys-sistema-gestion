-- HU-02B. Requiere las tablas de HU-02A en el esquema public.
-- 1 = lunes, 7 = domingo. Horarios locales semanales, sin fechas ni zona horaria.
begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table public.franja_profesional (
  id_franja uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references public.profesional(id_usuario),
  dia_semana integer not null check (dia_semana between 1 and 7),
  hora_inicio time without time zone not null,
  hora_fin time without time zone not null,
  creado timestamptz not null default now(),
  constraint franja_horas_validas check (
    hora_fin > hora_inicio and hora_fin < time '24:00'
    and extract(second from hora_inicio) = 0 and extract(second from hora_fin) = 0
  ),
  -- Intervalos [inicio, fin): 09-12 y 12-14 son contiguos, no superpuestos.
  constraint franja_sin_superposicion exclude using gist (
    id_usuario with =,
    dia_semana with =,
    int4range(
      (extract(hour from hora_inicio)::integer * 60 + extract(minute from hora_inicio)::integer),
      (extract(hour from hora_fin)::integer * 60 + extract(minute from hora_fin)::integer),
      '[)'
    ) with &&
  )
);
alter table public.franja_profesional enable row level security;
revoke all on public.franja_profesional from public, anon, authenticated;

create function public.fn_consultar_horarios_profesional(p_id_usuario uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if not exists (
    select 1 from public.usuario
    where id_usuario = auth.uid() and activo and rol_usuario = 'Gerente'
  ) then
    raise exception 'Solo el Gerente puede consultar los horarios del profesional';
  end if;

  select jsonb_build_object(
    'nombre_usuario', u.nombre_usuario,
    'apellido_usuario', u.apellido_usuario,
    'tiene_servicios', exists (
      select 1 from public.servicio_profesional sp where sp.id_usuario = p.id_usuario
    ),
    'habilitado_turnos', u.activo and p.activo
      and exists (select 1 from public.servicio_profesional sp where sp.id_usuario = p.id_usuario)
      and exists (select 1 from public.franja_profesional f where f.id_usuario = p.id_usuario),
    'franjas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id_franja', f.id_franja,
        'dia_semana', f.dia_semana,
        'hora_inicio', f.hora_inicio,
        'hora_fin', f.hora_fin
      ) order by f.dia_semana, f.hora_inicio)
      from public.franja_profesional f where f.id_usuario = p.id_usuario
    ), '[]'::jsonb)
  ) into v_resultado
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario
  where p.id_usuario = p_id_usuario;

  if v_resultado is null then raise exception 'El profesional no existe'; end if;
  return v_resultado;
end;
$$;

create function public.fn_registrar_franja_profesional(
  p_id_usuario uuid, p_dia_semana integer,
  p_hora_inicio time without time zone, p_hora_fin time without time zone
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.usuario
    where id_usuario = auth.uid() and activo and rol_usuario = 'Gerente'
  ) then
    raise exception 'Solo el Gerente puede registrar franjas horarias';
  end if;
  if not exists (select 1 from public.profesional where id_usuario = p_id_usuario) then
    raise exception 'El profesional no existe';
  end if;
  if not exists (select 1 from public.servicio_profesional where id_usuario = p_id_usuario) then
    raise exception 'El profesional debe tener al menos un servicio asociado';
  end if;
  if p_dia_semana is null or p_dia_semana not between 1 and 7 then
    raise exception 'Seleccioná un día de la semana válido';
  end if;
  if p_hora_inicio is null or p_hora_fin is null or p_hora_fin <= p_hora_inicio then
    raise exception 'La hora de fin debe ser posterior a la hora de inicio';
  end if;
  if p_hora_fin >= time '24:00'
    or extract(second from p_hora_inicio) <> 0 or extract(second from p_hora_fin) <> 0 then
    raise exception 'Ingresá horarios entre 00:00 y 23:59, sin segundos';
  end if;

  insert into public.franja_profesional (id_usuario, dia_semana, hora_inicio, hora_fin)
  values (p_id_usuario, p_dia_semana, p_hora_inicio, p_hora_fin)
  returning id_franja into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'La franja se superpone con otro horario del mismo día';
end;
$$;

revoke all on function public.fn_consultar_horarios_profesional(uuid) from public, anon;
revoke all on function public.fn_registrar_franja_profesional(uuid, integer, time, time) from public, anon;
grant execute on function public.fn_consultar_horarios_profesional(uuid) to authenticated;
grant execute on function public.fn_registrar_franja_profesional(uuid, integer, time, time) to authenticated;
notify pgrst, 'reload schema';
commit;

