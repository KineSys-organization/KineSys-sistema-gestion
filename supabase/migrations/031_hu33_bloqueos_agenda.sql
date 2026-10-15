-- HU-33. Bloquear días u horarios del calendario (feriados, cierres y licencias).
--
-- Ya está aplicada en el proyecto (migración hu33_bloqueos_agenda_hu37_repetir_varios_dias).
-- Este archivo es la copia de referencia para el repo.
--
--   * bloqueo_agenda: profesional null = todo el centro. RLS y sin grants.
--   * fn_horarios_del_dia descuenta los bloqueos (no ofrece ese horario).
--   * fn_crear_bloqueo con p_solo_consultar lista los turnos confirmados afectados
--     sin guardarlos. Guardar no cancela ni mueve esos turnos.
--   * El calendario del Profesional y la ocupación (HU-18) restan los minutos bloqueados.
--     La ocupación del centro cuenta solo profesionales activos arriba y abajo (corrección
--     030_hu18_ocupacion_centro_activos.sql); en la base se aplicó junto como
--     031_hu33_ocupacion_bloqueos_y_activos.
begin;

-- ---------- Helper interno ----------
create or replace function public.fn_minutos_del_dia(p_hora time)
returns integer
language sql
immutable
set search_path to ''
as $$
  select (extract(hour from p_hora) * 60 + extract(minute from p_hora))::integer
$$;

revoke all on function public.fn_minutos_del_dia(time) from public, anon, authenticated;

-- ---------- Tabla ----------
create table public.bloqueo_agenda (
  id_bloqueo uuid primary key default gen_random_uuid(),
  id_profesional uuid references public.profesional(id_usuario), -- null = todo el centro
  fecha_desde date not null,
  fecha_hasta date not null,
  hora_desde time,
  hora_hasta time,
  motivo text not null,
  creado_por uuid not null references public.usuario(id_usuario),
  creado timestamptz not null default now(),
  constraint bloqueo_agenda_fechas_validas
    check (fecha_hasta >= fecha_desde and fecha_hasta - fecha_desde < 90),
  constraint bloqueo_agenda_horas_validas
    check (
      (hora_desde is null and hora_hasta is null)
      or (hora_desde is not null and hora_hasta is not null and hora_hasta > hora_desde)
    ),
  constraint bloqueo_agenda_motivo_valido
    check (char_length(btrim(motivo)) between 1 and 100)
);

create index bloqueo_agenda_fechas_idx on public.bloqueo_agenda (fecha_desde, fecha_hasta);
create index bloqueo_agenda_profesional_idx on public.bloqueo_agenda (id_profesional);

alter table public.bloqueo_agenda enable row level security;
revoke all on table public.bloqueo_agenda from anon, authenticated;

-- ---------- Disponibilidad: descuenta los bloqueos ----------
create or replace function public.fn_horarios_del_dia(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_excluir_turno uuid default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_hoy date;
  v_ahora time;
  v_dia integer;
  v_duracion integer;
  v_paso integer;
  v_slots jsonb := '[]'::jsonb;
  v_en_franja jsonb := '[]'::jsonb;
  v_bloq jsonb := '{}'::jsonb;
  v_franja record;
  v_inicio time;
  v_fin_slot time;
  v_ocupado boolean;
  v_motivo_bloq text;
  v_nombre text;
  v_apellido text;
  v_servicio text;
begin
  v_hoy := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_ahora := (timezone('America/Argentina/Buenos_Aires', now()))::time;

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
      'mensaje', 'No hay horarios para esa fecha',
      'en_franja', '[]'::jsonb,
      'bloqueados', '{}'::jsonb
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
      v_en_franja := v_en_franja || jsonb_build_array(to_char(v_inicio, 'HH24:MI'));

      if p_fecha = v_hoy and v_inicio < v_ahora then
        v_inicio := v_inicio + make_interval(mins => v_paso);
        continue;
      end if;

      v_motivo_bloq := null;
      select b.motivo into v_motivo_bloq
      from public.bloqueo_agenda b
      where p_fecha between b.fecha_desde and b.fecha_hasta
        and (b.id_profesional is null or b.id_profesional = p_id_profesional)
        and (b.hora_desde is null
             or (b.hora_desde < v_fin_slot and b.hora_hasta > v_inicio))
      order by (b.id_profesional is null) desc, b.creado
      limit 1;

      if v_motivo_bloq is not null then
        v_bloq := v_bloq || jsonb_build_object(to_char(v_inicio, 'HH24:MI'), v_motivo_bloq);
        v_inicio := v_inicio + make_interval(mins => v_paso);
        continue;
      end if;

      select exists (
        select 1
        from public.turno t
        where t.id_profesional = p_id_profesional
          and t.fecha = p_fecha
          and t.estado in ('confirmado', 'atendido', 'ausente')
          and t.id_turno is distinct from p_excluir_turno
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
      when jsonb_array_length(v_slots) = 0 and v_bloq <> '{}'::jsonb
        then 'No hay horarios disponibles (bloqueado: '
             || (select e.value from jsonb_each_text(v_bloq) e limit 1) || ')'
      when jsonb_array_length(v_slots) = 0 then 'No hay horarios para esa fecha'
      else null
    end,
    'en_franja', v_en_franja,
    'bloqueados', v_bloq
  );
end;
$function$;

create or replace function public.fn_consultar_disponibilidad(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_excluir_turno uuid default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar disponibilidad';
  end if;

  if p_id_profesional is null or p_id_servicio is null or p_fecha is null then
    raise exception 'Faltan campos';
  end if;

  if p_fecha < v_hoy then
    raise exception 'No se puede consultar una fecha pasada';
  end if;

  if p_fecha > v_hoy + 30 then
    raise exception 'Solo se puede consultar disponibilidad hasta 30 días desde hoy';
  end if;

  return public.fn_horarios_del_dia(
    p_id_profesional, p_id_servicio, p_fecha, p_excluir_turno
  ) - 'en_franja' - 'bloqueados';
end;
$function$;

-- ---------- Crear (con modo consulta), listar, eliminar, consultar ----------
create or replace function public.fn_crear_bloqueo(
  p_id_profesional uuid,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_hora_desde time,
  p_hora_hasta time,
  p_motivo text,
  p_solo_consultar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ahora timestamp := timezone('America/Argentina/Buenos_Aires', now());
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_id uuid;
  v_afectados jsonb;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_fecha_desde is null or p_fecha_hasta is null then
    raise exception 'Indicá la fecha desde y la fecha hasta';
  end if;

  if p_fecha_hasta < p_fecha_desde then
    raise exception 'La fecha hasta no puede ser anterior a la fecha desde';
  end if;

  if p_fecha_desde < v_hoy then
    raise exception 'No se pueden bloquear fechas pasadas';
  end if;

  if p_fecha_hasta - p_fecha_desde + 1 > 90 then
    raise exception 'El bloqueo no puede superar los 90 días';
  end if;

  if (p_hora_desde is null) <> (p_hora_hasta is null) then
    raise exception 'Completá la hora desde y la hora hasta, o dejá las dos vacías';
  end if;

  if p_hora_desde is not null then
    if extract(second from p_hora_desde) <> 0 or extract(second from p_hora_hasta) <> 0 then
      raise exception 'Las horas tienen que estar en formato HH:MM';
    end if;
    if p_hora_hasta <= p_hora_desde then
      raise exception 'La hora de fin debe ser posterior a la de inicio';
    end if;
  end if;

  if v_motivo is null then
    raise exception 'Indicá el motivo del bloqueo';
  end if;

  if char_length(v_motivo) > 100 then
    raise exception 'El motivo no puede superar los 100 caracteres';
  end if;

  if p_id_profesional is not null and not exists (
    select 1
    from public.profesional p
    join public.usuario u on u.id_usuario = p.id_usuario
    where p.id_usuario = p_id_profesional
      and p.activo = true
      and u.activo = true
      and u.rol_usuario = 'Profesional'
  ) then
    raise exception 'El profesional no existe o no está activo';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id_turno', t.id_turno,
        'fecha', t.fecha,
        'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
        'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
        'id_paciente', t.id_paciente,
        'nombre_paciente', pa.nombre_paciente,
        'apellido_paciente', pa.apellido_paciente,
        'id_profesional', t.id_profesional,
        'nombre_profesional', u.nombre_usuario,
        'apellido_profesional', u.apellido_usuario
      )
      order by t.fecha, t.hora_inicio
    ),
    '[]'::jsonb
  )
  into v_afectados
  from public.turno t
  left join public.paciente pa on pa.id_paciente = t.id_paciente
  join public.usuario u on u.id_usuario = t.id_profesional
  where t.estado = 'confirmado'
    and t.fecha between p_fecha_desde and p_fecha_hasta
    and (t.fecha + t.hora_fin) > v_ahora
    and (p_id_profesional is null or t.id_profesional = p_id_profesional)
    and (p_hora_desde is null
         or (t.hora_inicio < p_hora_hasta and t.hora_fin > p_hora_desde));

  if not coalesce(p_solo_consultar, false) then
    insert into public.bloqueo_agenda (
      id_profesional, fecha_desde, fecha_hasta, hora_desde, hora_hasta, motivo, creado_por
    )
    values (
      p_id_profesional, p_fecha_desde, p_fecha_hasta, p_hora_desde, p_hora_hasta,
      v_motivo, auth.uid()
    )
    returning id_bloqueo into v_id;
  end if;

  return jsonb_build_object(
    'guardado', not coalesce(p_solo_consultar, false),
    'id_bloqueo', v_id,
    'cantidad_afectados', jsonb_array_length(v_afectados),
    'turnos_afectados', v_afectados
  );
end;
$function$;

create or replace function public.fn_listar_bloqueos()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_ahora timestamp := timezone('America/Argentina/Buenos_Aires', now());
begin
  perform public.fn_exigir_rol(array['Gerente']);

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id_bloqueo', b.id_bloqueo,
          'alcance', case when b.id_profesional is null then 'centro' else 'profesional' end,
          'id_profesional', b.id_profesional,
          'nombre_profesional', up.nombre_usuario,
          'apellido_profesional', up.apellido_usuario,
          'fecha_desde', b.fecha_desde,
          'fecha_hasta', b.fecha_hasta,
          'hora_desde', to_char(b.hora_desde, 'HH24:MI'),
          'hora_hasta', to_char(b.hora_hasta, 'HH24:MI'),
          'dia_completo', b.hora_desde is null,
          'motivo', b.motivo,
          'creado', b.creado,
          'nombre_creador', uc.nombre_usuario,
          'apellido_creador', uc.apellido_usuario,
          'eliminable', (b.fecha_desde + coalesce(b.hora_desde, time '00:00')) > v_ahora
        )
        order by b.fecha_desde, b.hora_desde nulls first, b.creado
      )
      from public.bloqueo_agenda b
      left join public.usuario up on up.id_usuario = b.id_profesional
      left join public.usuario uc on uc.id_usuario = b.creado_por
      where b.fecha_hasta >= v_hoy
    ),
    '[]'::jsonb
  );
end;
$function$;

create or replace function public.fn_eliminar_bloqueo(p_id_bloqueo uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ahora timestamp := timezone('America/Argentina/Buenos_Aires', now());
  v_b public.bloqueo_agenda;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_id_bloqueo is null then
    raise exception 'Faltan campos';
  end if;

  select * into v_b from public.bloqueo_agenda b where b.id_bloqueo = p_id_bloqueo for update;

  if v_b.id_bloqueo is null then
    raise exception 'El bloqueo no existe';
  end if;

  if (v_b.fecha_desde + coalesce(v_b.hora_desde, time '00:00')) <= v_ahora then
    raise exception 'El bloqueo ya empezó y no se puede eliminar';
  end if;

  delete from public.bloqueo_agenda where id_bloqueo = p_id_bloqueo;

  return jsonb_build_object('eliminado', true, 'id_bloqueo', p_id_bloqueo);
end;
$function$;

create or replace function public.fn_consultar_bloqueos_agenda(
  p_id_profesional uuid,
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if not public.fn_es_recepcion() then
    perform public.fn_exigir_rol(array['Profesional']);
    if p_id_profesional is distinct from auth.uid() then
      raise exception 'Solo podés consultar tu propia agenda';
    end if;
  end if;

  if p_id_profesional is null or p_desde is null or p_hasta is null then
    raise exception 'Faltan campos';
  end if;

  if p_hasta < p_desde then
    raise exception 'La fecha hasta no puede ser anterior a la fecha desde';
  end if;

  if p_hasta - p_desde > 92 then
    raise exception 'El período no puede superar los 93 días';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id_bloqueo', b.id_bloqueo,
          'alcance', case when b.id_profesional is null then 'centro' else 'profesional' end,
          'fecha_desde', b.fecha_desde,
          'fecha_hasta', b.fecha_hasta,
          'hora_desde', to_char(b.hora_desde, 'HH24:MI'),
          'hora_hasta', to_char(b.hora_hasta, 'HH24:MI'),
          'dia_completo', b.hora_desde is null,
          'motivo', b.motivo
        )
        order by b.fecha_desde, b.hora_desde nulls first, b.creado
      )
      from public.bloqueo_agenda b
      where b.fecha_desde <= p_hasta
        and b.fecha_hasta >= p_desde
        and (b.id_profesional is null or b.id_profesional = p_id_profesional)
    ),
    '[]'::jsonb
  );
end;
$function$;

revoke all on function public.fn_crear_bloqueo(uuid, date, date, time, time, text, boolean) from public, anon;
revoke all on function public.fn_listar_bloqueos() from public, anon;
revoke all on function public.fn_eliminar_bloqueo(uuid) from public, anon;
revoke all on function public.fn_consultar_bloqueos_agenda(uuid, date, date) from public, anon;

grant execute on function public.fn_crear_bloqueo(uuid, date, date, time, time, text, boolean) to authenticated;
grant execute on function public.fn_listar_bloqueos() to authenticated;
grant execute on function public.fn_eliminar_bloqueo(uuid) to authenticated;
grant execute on function public.fn_consultar_bloqueos_agenda(uuid, date, date) to authenticated;

-- ---------- Calendario del Profesional (HU-15): suma los bloqueos del mes ----------
create or replace function public.fn_consultar_dashboard_profesional(p_mes date default null)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_profesional uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_lunes date;
  v_mes_desde date;
  v_mes_hasta date;
begin
  perform public.fn_exigir_rol(array['Profesional']);
  v_profesional := auth.uid();

  v_lunes := v_hoy - (extract(isodow from v_hoy)::int - 1);

  v_mes_desde := date_trunc('month', coalesce(p_mes, v_hoy))::date;
  v_mes_hasta := (v_mes_desde + interval '1 month')::date - 1;

  return jsonb_build_object(
    'hoy', v_hoy,
    'dia', (
      select jsonb_build_object(
        'total', count(*) filter (where t.estado <> 'cancelado'),
        'atendidos', count(*) filter (where t.estado = 'atendido'),
        'pendientes', count(*) filter (where t.estado = 'confirmado')
      )
      from public.turno t
      where t.id_profesional = v_profesional
        and t.fecha = v_hoy
    ),
    'semana', (
      select jsonb_build_object(
        'desde', v_lunes,
        'hasta', v_lunes + 6,
        'cancelaciones', count(*) filter (where t.estado = 'cancelado'),
        'ausencias', count(*) filter (where t.estado = 'ausente')
      )
      from public.turno t
      where t.id_profesional = v_profesional
        and t.fecha between v_lunes and v_lunes + 6
    ),
    'mes', jsonb_build_object(
      'desde', v_mes_desde,
      'hasta', v_mes_hasta,
      'turnos', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id_turno', t.id_turno,
              'estado', t.estado,
              'fecha', t.fecha,
              'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
              'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
              'nombre_paciente', pa.nombre_paciente,
              'apellido_paciente', pa.apellido_paciente,
              'nombre_servicio', s.nombre_servicio
            )
            order by t.fecha, t.hora_inicio, (t.estado = 'cancelado'), t.creado
          )
          from public.turno t
          join public.paciente pa on pa.id_paciente = t.id_paciente
          join public.servicio s on s.id_servicio = t.id_servicio
          where t.id_profesional = v_profesional
            and t.fecha between v_mes_desde and v_mes_hasta
        ),
        '[]'::jsonb
      ),
      'bloqueos', public.fn_consultar_bloqueos_agenda(v_profesional, v_mes_desde, v_mes_hasta)
    )
  );
end;
$function$;

-- ---------- Ocupación (HU-18): descuenta los minutos bloqueados ----------
create or replace function public.fn_consultar_dashboard_operativo(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_desde is null or p_hasta is null then
    raise exception 'Elegí el período (desde y hasta)';
  end if;

  if p_desde > p_hasta then
    raise exception 'La fecha desde no puede ser posterior a la fecha hasta';
  end if;

  if p_hasta - p_desde > 366 then
    raise exception 'El período no puede superar un año';
  end if;

  return (
    with fechas as (
      select d.fecha::date as fecha
      from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as d(fecha)
    ),
    turnos_profesional as (
      select
        t.id_profesional,
        count(*)::integer as total,
        (count(*) filter (where t.estado = 'confirmado'))::integer as confirmados,
        (count(*) filter (where t.estado = 'atendido'))::integer as atendidos,
        (count(*) filter (where t.estado = 'cancelado'))::integer as cancelados,
        (count(*) filter (where t.estado = 'ausente'))::integer as ausentes,
        coalesce(
          sum(extract(epoch from (t.hora_fin - t.hora_inicio)) / 60)
            filter (where t.estado in ('confirmado', 'atendido', 'ausente')),
          0
        )::integer as minutos_ocupados
      from public.turno t
      where t.fecha between p_desde and p_hasta
      group by t.id_profesional
    ),
    turnos_servicio as (
      select
        t.id_servicio,
        count(*)::integer as total,
        (count(*) filter (where t.estado = 'confirmado'))::integer as confirmados,
        (count(*) filter (where t.estado = 'atendido'))::integer as atendidos,
        (count(*) filter (where t.estado = 'cancelado'))::integer as cancelados,
        (count(*) filter (where t.estado = 'ausente'))::integer as ausentes
      from public.turno t
      where t.fecha between p_desde and p_hasta
      group by t.id_servicio
    ),
    profesionales_activos as (
      select p.id_usuario
      from public.profesional p
      join public.usuario u on u.id_usuario = p.id_usuario
      where p.activo = true
        and u.activo = true
        and u.rol_usuario = 'Profesional'
    ),
    disponibilidad_profesional as (
      select
        pa.id_usuario,
        coalesce(
          sum(
            extract(epoch from (f.hora_fin - f.hora_inicio)) / 60
            - coalesce(bl.minutos_bloqueados, 0)
          ),
          0
        )::integer as minutos_disponibles
      from profesionales_activos pa
      cross join fechas d
      left join public.franja_profesional f
        on f.id_usuario = pa.id_usuario
        and f.dia_semana = extract(isodow from d.fecha)::integer
      left join lateral (
        select coalesce(sum(upper(x) - lower(x)), 0) as minutos_bloqueados
        from unnest(
          (
            select range_agg(
              int4range(
                case when b.hora_desde is null then 0
                     else public.fn_minutos_del_dia(b.hora_desde) end,
                case when b.hora_hasta is null then 1440
                     else public.fn_minutos_del_dia(b.hora_hasta) end
              )
            )
            from public.bloqueo_agenda b
            where d.fecha between b.fecha_desde and b.fecha_hasta
              and (b.id_profesional is null or b.id_profesional = pa.id_usuario)
          )
          * int4multirange(
              int4range(
                public.fn_minutos_del_dia(f.hora_inicio),
                public.fn_minutos_del_dia(f.hora_fin)
              )
            )
        ) x
        where f.id_franja is not null
      ) bl on true
      group by pa.id_usuario
    ),
    ocupacion_centro as (
      select
        coalesce(sum(tp.minutos_ocupados), 0)::integer as minutos_ocupados,
        coalesce(sum(dp.minutos_disponibles), 0)::integer as minutos_disponibles
      from profesionales_activos pa
      join disponibilidad_profesional dp on dp.id_usuario = pa.id_usuario
      left join turnos_profesional tp on tp.id_profesional = pa.id_usuario
    ),
    profesionales_a_mostrar as (
      select
        p.id_usuario,
        u.nombre_usuario,
        u.apellido_usuario,
        (p.activo and u.activo and u.rol_usuario = 'Profesional') as activo,
        coalesce(tp.total, 0) as total,
        coalesce(tp.confirmados, 0) as confirmados,
        coalesce(tp.atendidos, 0) as atendidos,
        coalesce(tp.cancelados, 0) as cancelados,
        coalesce(tp.ausentes, 0) as ausentes,
        coalesce(tp.minutos_ocupados, 0) as minutos_ocupados,
        case
          when p.activo and u.activo and u.rol_usuario = 'Profesional'
            then dp.minutos_disponibles
          else null
        end as minutos_disponibles,
        case
          when not (p.activo and u.activo and u.rol_usuario = 'Profesional') then 'inactivo'
          when dp.minutos_disponibles = 0 then 'sin_franjas'
          else 'calculable'
        end as estado_ocupacion,
        case
          when p.activo and u.activo and u.rol_usuario = 'Profesional'
            and dp.minutos_disponibles > 0
            then round(coalesce(tp.minutos_ocupados, 0) * 100.0 / dp.minutos_disponibles, 1)
          else null
        end as porcentaje_ocupacion
      from public.profesional p
      join public.usuario u on u.id_usuario = p.id_usuario
      left join turnos_profesional tp on tp.id_profesional = p.id_usuario
      left join disponibilidad_profesional dp on dp.id_usuario = p.id_usuario
      where (p.activo and u.activo and u.rol_usuario = 'Profesional')
        or coalesce(tp.total, 0) > 0
    )
    select jsonb_build_object(
      'desde', p_desde,
      'hasta', p_hasta,
      'pacientes_nuevos', (
        select count(*)
        from public.paciente pa
        where (pa.creado at time zone 'America/Argentina/Buenos_Aires')::date
              between p_desde and p_hasta
      ),
      'pacientes_recurrentes', (
        select count(distinct t.id_paciente)
        from public.turno t
        join public.paciente pa on pa.id_paciente = t.id_paciente
        where t.fecha between p_desde and p_hasta
          and (pa.creado at time zone 'America/Argentina/Buenos_Aires')::date < p_desde
      ),
      'ocupacion_centro', (
        select jsonb_build_object(
          'minutos_ocupados', oc.minutos_ocupados,
          'minutos_disponibles', oc.minutos_disponibles,
          'porcentaje', case
            when oc.minutos_disponibles > 0
              then round(oc.minutos_ocupados * 100.0 / oc.minutos_disponibles, 1)
            else null
          end,
          'estado', case when oc.minutos_disponibles > 0 then 'calculable' else 'sin_franjas' end
        )
        from ocupacion_centro oc
      ),
      'profesionales', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'id_profesional', pm.id_usuario,
            'nombre', pm.nombre_usuario,
            'apellido', pm.apellido_usuario,
            'activo', pm.activo,
            'total', pm.total,
            'confirmados', pm.confirmados,
            'atendidos', pm.atendidos,
            'cancelados', pm.cancelados,
            'ausentes', pm.ausentes,
            'minutos_ocupados', pm.minutos_ocupados,
            'minutos_disponibles', pm.minutos_disponibles,
            'porcentaje_ocupacion', pm.porcentaje_ocupacion,
            'estado_ocupacion', pm.estado_ocupacion
          ) order by pm.total desc, pm.apellido_usuario, pm.nombre_usuario),
          '[]'::jsonb
        )
        from profesionales_a_mostrar pm
      ),
      'servicios', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'id_servicio', s.id_servicio,
            'nombre', s.nombre_servicio,
            'activo', s.activo,
            'total', ts.total,
            'confirmados', ts.confirmados,
            'atendidos', ts.atendidos,
            'cancelados', ts.cancelados,
            'ausentes', ts.ausentes
          ) order by ts.total desc, s.nombre_servicio),
          '[]'::jsonb
        )
        from turnos_servicio ts
        join public.servicio s on s.id_servicio = ts.id_servicio
      )
    )
  );
end;
$function$;

notify pgrst, 'reload schema';

commit;
