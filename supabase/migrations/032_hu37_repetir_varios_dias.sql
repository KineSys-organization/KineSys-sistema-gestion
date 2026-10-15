-- HU-37. Repetir un turno en varios días de la semana.
--
-- Amplía HU-25. Ya está aplicada en el proyecto, junto con HU-33
-- (migración hu33_bloqueos_agenda_hu37_repetir_varios_dias).
-- Este archivo es la copia de referencia para el repo.
--
-- Las firmas cambian: drop + create, no create or replace.
--   fn_turno_repetir_preview(turno, dias[], horas[], semanas, sesiones)
--   fn_turno_repetir_confirmar(turno, dias[], horas[], semanas, sesiones)
-- Sin días, se comporta como HU-25 (solo el día y la hora del turno original).
-- Semanas o sesiones, una de las dos. Tope: 24 turnos nuevos.
begin;

-- Misma firma. Suma el motivo "Bloqueado: ..." (HU-33) y "no atiende los <día>".
create or replace function public.fn_evaluar_repeticion(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_hora time
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_disp jsonb;
  v_hora text := to_char(p_hora, 'HH24:MI');
  v_hora_fin time;
  v_dow integer := extract(isodow from p_fecha)::integer;
begin
  if p_fecha + p_hora < timezone('America/Argentina/Buenos_Aires', now()) then
    return jsonb_build_object('disponible', false, 'motivo', 'Fecha pasada', 'hora_fin', null);
  end if;

  begin
    v_disp := public.fn_horarios_del_dia(p_id_profesional, p_id_servicio, p_fecha);
  exception when others then
    return jsonb_build_object(
      'disponible', false,
      'motivo', case
        when sqlerrm = 'El profesional no existe o no está activo' then 'Profesional inactivo'
        else sqlerrm
      end,
      'hora_fin', null
    );
  end;

  v_hora_fin := p_hora + make_interval(mins => (v_disp ->> 'duracion_minutos')::integer);

  if (v_disp -> 'horarios') ? v_hora then
    return jsonb_build_object('disponible', true, 'motivo', null, 'hora_fin', v_hora_fin);
  end if;

  if (v_disp -> 'bloqueados') ? v_hora then
    return jsonb_build_object(
      'disponible', false,
      'motivo', 'Bloqueado: ' || (v_disp -> 'bloqueados' ->> v_hora),
      'hora_fin', v_hora_fin
    );
  end if;

  if (v_disp -> 'en_franja') ? v_hora then
    return jsonb_build_object('disponible', false, 'motivo', 'Horario ocupado', 'hora_fin', v_hora_fin);
  end if;

  if not exists (
    select 1 from public.franja_profesional f
    where f.id_usuario = p_id_profesional and f.dia_semana = v_dow
  ) then
    return jsonb_build_object(
      'disponible', false,
      'motivo', 'El profesional no atiende los '
        || (array['lunes','martes','miércoles','jueves','viernes','sábados','domingos'])[v_dow],
      'hora_fin', v_hora_fin
    );
  end if;

  return jsonb_build_object(
    'disponible', false,
    'motivo', 'Fuera de la franja del profesional',
    'hora_fin', v_hora_fin
  );
end;
$function$;

drop function if exists public.fn_turno_repetir_preview(uuid, integer);
drop function if exists public.fn_turno_repetir_confirmar(uuid, integer);
drop function if exists public.fn_turno_repetible(uuid, integer);

create or replace function public.fn_turno_repetible(p_id_turno uuid)
returns public.turno
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_turno public.turno;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para repetir turnos';
  end if;

  if p_id_turno is null then
    raise exception 'Faltan campos';
  end if;

  select * into v_turno from public.turno t where t.id_turno = p_id_turno;

  if v_turno.id_turno is null then
    raise exception 'El turno no existe';
  end if;

  if v_turno.estado <> 'confirmado' then
    raise exception 'Solo se puede repetir un turno confirmado';
  end if;

  if v_turno.id_paciente is null then
    raise exception 'El turno no tiene un paciente asociado';
  end if;

  if not exists (
    select 1 from public.paciente
    where id_paciente = v_turno.id_paciente and activo = true
  ) then
    raise exception 'El paciente no existe o no está activo';
  end if;

  return v_turno;
end;
$function$;

create or replace function public.fn_fechas_repeticion(
  p_fecha date,
  p_hora time,
  p_dias integer[],
  p_horas time[],
  p_semanas integer,
  p_sesiones integer
)
returns table(fecha date, hora time, dia_semana integer)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_dias integer[];
  v_horas time[];
  v_n integer;
  v_i integer;
  v_h time;
begin
  if p_dias is null then
    v_dias := array[extract(isodow from p_fecha)::integer];
  else
    v_dias := array(select d from unnest(p_dias) with ordinality as t(d, o) order by o);
  end if;

  v_n := coalesce(cardinality(v_dias), 0);

  if v_n = 0 then
    raise exception 'Elegí al menos un día de la semana';
  end if;

  if exists (select 1 from unnest(v_dias) d where d is null or d < 1 or d > 7) then
    raise exception 'Los días de la semana no son válidos';
  end if;

  if (select count(distinct d) from unnest(v_dias) d) <> v_n then
    raise exception 'Un mismo día no se puede elegir dos veces';
  end if;

  if p_horas is null then
    v_horas := array_fill(p_hora, array[v_n]);
  else
    v_horas := array(select h from unnest(p_horas) with ordinality as t(h, o) order by o);
    if cardinality(v_horas) <> v_n then
      raise exception 'Tiene que haber una hora por cada día elegido';
    end if;
  end if;

  for v_i in 1..v_n loop
    v_h := coalesce(v_horas[v_i], p_hora);
    if extract(second from v_h) <> 0 then
      raise exception 'La hora indicada no tiene un formato válido (HH:MM)';
    end if;
    v_horas[v_i] := v_h;
  end loop;

  if p_semanas is not null and p_sesiones is not null then
    raise exception 'Elegí cantidad de semanas o cantidad de sesiones, no las dos';
  end if;

  if p_semanas is null and p_sesiones is null then
    raise exception 'Indicá hasta cuándo se repite: cantidad de semanas o de sesiones';
  end if;

  if coalesce(p_semanas, p_sesiones) < 1 then
    raise exception 'La cantidad de semanas o de sesiones tiene que ser mayor a cero';
  end if;

  if p_semanas is not null and p_semanas::bigint * v_n > 24 then
    raise exception 'No se pueden crear más de 24 turnos nuevos en total';
  end if;

  if p_sesiones is not null and p_sesiones > 24 then
    raise exception 'No se pueden crear más de 24 turnos nuevos en total';
  end if;

  return query
  select
    d.f,
    v_horas[array_position(v_dias, extract(isodow from d.f)::integer)],
    extract(isodow from d.f)::integer
  from (
    select g::date as f
    from generate_series(
      p_fecha + 1,
      p_fecha + 7 * coalesce(p_semanas, p_sesiones),
      interval '1 day'
    ) g
  ) d
  where extract(isodow from d.f)::integer = any (v_dias)
  order by d.f
  limit p_sesiones;
end;
$function$;

create or replace function public.fn_turno_repetir_preview(
  p_id_turno uuid,
  p_dias integer[] default null,
  p_horas time[] default null,
  p_semanas integer default null,
  p_sesiones integer default null
)
returns table(
  fecha date,
  hora_inicio text,
  hora_fin text,
  disponible boolean,
  motivo text,
  dia_semana integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_turno public.turno := public.fn_turno_repetible(p_id_turno);
  v_f record;
  v_eval jsonb;
begin
  for v_f in
    select * from public.fn_fechas_repeticion(
      v_turno.fecha, v_turno.hora_inicio, p_dias, p_horas, p_semanas, p_sesiones
    )
  loop
    v_eval := public.fn_evaluar_repeticion(
      v_turno.id_profesional, v_turno.id_servicio, v_f.fecha, v_f.hora
    );
    fecha := v_f.fecha;
    dia_semana := v_f.dia_semana;
    hora_inicio := to_char(v_f.hora, 'HH24:MI');
    hora_fin := to_char(
      coalesce((v_eval ->> 'hora_fin')::time, v_f.hora + (v_turno.hora_fin - v_turno.hora_inicio)),
      'HH24:MI'
    );
    disponible := (v_eval ->> 'disponible')::boolean;
    motivo := v_eval ->> 'motivo';
    return next;
  end loop;
end;
$function$;

create or replace function public.fn_turno_repetir_confirmar(
  p_id_turno uuid,
  p_dias integer[] default null,
  p_horas time[] default null,
  p_semanas integer default null,
  p_sesiones integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_turno public.turno := public.fn_turno_repetible(p_id_turno);
  v_actual public.turno;
  v_lock record;
  v_f record;
  v_eval jsonb;
  v_id_serie uuid;
  v_id uuid;
  v_creados jsonb := '[]'::jsonb;
  v_omitidos jsonb := '[]'::jsonb;
begin
  for v_lock in
    select distinct hashtextextended(v_turno.id_profesional::text || dias.d::text, 0) as clave
    from (
      select v_turno.fecha as d
      union
      select f.fecha
      from public.fn_fechas_repeticion(
        v_turno.fecha, v_turno.hora_inicio, p_dias, p_horas, p_semanas, p_sesiones
      ) f
    ) dias
    order by clave
  loop
    perform pg_advisory_xact_lock(v_lock.clave);
  end loop;

  select * into v_actual from public.turno t where t.id_turno = p_id_turno for update;

  if v_actual.estado <> 'confirmado' then
    raise exception 'Solo se puede repetir un turno confirmado';
  end if;

  if v_actual.fecha <> v_turno.fecha or v_actual.hora_inicio <> v_turno.hora_inicio then
    raise exception 'El turno cambió mientras armabas la serie; volvé a intentarlo';
  end if;

  v_id_serie := v_actual.id_serie;

  for v_f in
    select * from public.fn_fechas_repeticion(
      v_actual.fecha, v_actual.hora_inicio, p_dias, p_horas, p_semanas, p_sesiones
    )
  loop
    v_eval := public.fn_evaluar_repeticion(
      v_actual.id_profesional, v_actual.id_servicio, v_f.fecha, v_f.hora
    );

    if not (v_eval ->> 'disponible')::boolean then
      v_omitidos := v_omitidos || jsonb_build_array(
        jsonb_build_object(
          'fecha', v_f.fecha,
          'hora_inicio', to_char(v_f.hora, 'HH24:MI'),
          'motivo', v_eval ->> 'motivo'
        )
      );
      continue;
    end if;

    if v_id_serie is null then
      insert into public.serie_turno (
        id_turno_origen, id_paciente, id_profesional, id_servicio, creada_por
      )
      values (
        v_actual.id_turno, v_actual.id_paciente, v_actual.id_profesional,
        v_actual.id_servicio, auth.uid()
      )
      returning id_serie into v_id_serie;

      update public.turno set id_serie = v_id_serie where id_turno = v_actual.id_turno;
    end if;

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
        numero_afiliado,
        id_serie,
        prioridad,
        prioridad_nota
      )
      values (
        v_actual.id_profesional,
        v_actual.id_servicio,
        v_actual.id_paciente,
        v_f.fecha,
        v_f.hora,
        (v_eval ->> 'hora_fin')::time,
        'confirmado',
        v_actual.id_obra_social,
        v_actual.numero_afiliado,
        v_id_serie,
        v_actual.prioridad,
        v_actual.prioridad_nota
      )
      returning id_turno into v_id;

      v_creados := v_creados || jsonb_build_array(
        jsonb_build_object(
          'id_turno', v_id,
          'fecha', v_f.fecha,
          'hora_inicio', to_char(v_f.hora, 'HH24:MI')
        )
      );
    exception when exclusion_violation then
      v_omitidos := v_omitidos || jsonb_build_array(
        jsonb_build_object(
          'fecha', v_f.fecha,
          'hora_inicio', to_char(v_f.hora, 'HH24:MI'),
          'motivo', 'Horario ocupado'
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'id_serie', v_id_serie,
    'creados', v_creados,
    'omitidos', v_omitidos
  );
end;
$function$;

revoke all on function public.fn_turno_repetible(uuid) from public, anon, authenticated;
revoke all on function public.fn_fechas_repeticion(date, time, integer[], time[], integer, integer)
  from public, anon, authenticated;
revoke all on function public.fn_turno_repetir_preview(uuid, integer[], time[], integer, integer) from public, anon;
revoke all on function public.fn_turno_repetir_confirmar(uuid, integer[], time[], integer, integer) from public, anon;

grant execute on function public.fn_turno_repetir_preview(uuid, integer[], time[], integer, integer) to authenticated;
grant execute on function public.fn_turno_repetir_confirmar(uuid, integer[], time[], integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
