-- HU-26. Consultar indicadores generales del centro (solo Gerente).
--
-- Para un período desde/hasta (fechas de Argentina, ambos incluidos) calcula:
--   * Turnos del período: total registrados y por estado (confirmados, atendidos, cancelados, ausentes).
--   * Tasa de ocupación = minutos ocupados / minutos disponibles.
--       - Disponibles: franjas semanales (HU-02B) de cada profesional activo, repetidas en cada
--         día del período que cae en ese día de la semana, desde el día en que se cargó la franja
--         (antes no existía: un período viejo no suma disponibilidad inventada).
--       - Ocupados: turnos confirmados, atendidos o ausentes (un ausente reservó el horario; un
--         cancelado lo liberó). Se cuenta solo la parte del turno que cae dentro de una franja,
--         así un turno que quedó fuera por una edición de franjas (HU-03) no pasa del 100 %.
--       - Vista general del centro y desglose por profesional activo.
--   * Pacientes nuevos: pacientes dados de alta (paciente.creado, hora de Argentina) en el período.
-- Un período sin datos devuelve todo en cero (no es un error).
-- Solo lectura: no crea tablas ni toca las existentes.

create or replace function public.fn_consultar_indicadores_generales(
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
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

  with dias as (
    select d::date as fecha, extract(isodow from d)::integer as dia_semana
    from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as d
  ),
  profesionales as (
    select p.id_usuario, u.nombre_usuario, u.apellido_usuario
    from public.profesional p
    join public.usuario u on u.id_usuario = p.id_usuario
    where u.rol_usuario = 'Profesional'
      and p.activo = true
      and u.activo = true
  ),
  turnos_periodo as (
    select t.*
    from public.turno t
    where t.fecha between p_desde and p_hasta
  ),
  disponible as (
    select f.id_usuario,
           sum(extract(epoch from (f.hora_fin - f.hora_inicio)) / 60) as minutos
    from dias d
    join public.franja_profesional f
      on f.dia_semana = d.dia_semana
     and d.fecha >= (f.creado at time zone 'America/Argentina/Buenos_Aires')::date
    group by f.id_usuario
  ),
  ocupado as (
    select t.id_profesional,
           sum(extract(epoch from (least(t.hora_fin, f.hora_fin)
                                   - greatest(t.hora_inicio, f.hora_inicio))) / 60) as minutos
    from turnos_periodo t
    join public.franja_profesional f
      on f.id_usuario = t.id_profesional
     and f.dia_semana = extract(isodow from t.fecha)::integer
     and f.hora_inicio < t.hora_fin
     and f.hora_fin > t.hora_inicio
    where t.estado in ('confirmado', 'atendido', 'ausente')
    group by t.id_profesional
  ),
  por_profesional as (
    select pr.id_usuario,
           pr.nombre_usuario,
           pr.apellido_usuario,
           (select count(*) from turnos_periodo t where t.id_profesional = pr.id_usuario) as turnos,
           coalesce(di.minutos, 0)::integer as minutos_disponibles,
           coalesce(oc.minutos, 0)::integer as minutos_ocupados
    from profesionales pr
    left join disponible di on di.id_usuario = pr.id_usuario
    left join ocupado oc on oc.id_profesional = pr.id_usuario
  ),
  totales as (
    select coalesce(sum(minutos_disponibles), 0)::integer as disponibles,
           coalesce(sum(minutos_ocupados), 0)::integer as ocupados
    from por_profesional
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'turnos', jsonb_build_object(
      'total', (select count(*) from turnos_periodo),
      'confirmados', (select count(*) from turnos_periodo where estado = 'confirmado'),
      'atendidos', (select count(*) from turnos_periodo where estado = 'atendido'),
      'cancelados', (select count(*) from turnos_periodo where estado = 'cancelado'),
      'ausentes', (select count(*) from turnos_periodo where estado = 'ausente')
    ),
    'ocupacion', (
      select jsonb_build_object(
        'minutos_disponibles', tt.disponibles,
        'minutos_ocupados', tt.ocupados,
        'porcentaje', case when tt.disponibles = 0 then 0
                           else round(100.0 * tt.ocupados / tt.disponibles, 1) end
      )
      from totales tt
    ),
    'profesionales', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id_profesional', pp.id_usuario,
          'nombre_profesional', pp.nombre_usuario,
          'apellido_profesional', pp.apellido_usuario,
          'turnos', pp.turnos,
          'minutos_disponibles', pp.minutos_disponibles,
          'minutos_ocupados', pp.minutos_ocupados,
          'porcentaje', case when pp.minutos_disponibles = 0 then 0
                             else round(100.0 * pp.minutos_ocupados / pp.minutos_disponibles, 1) end
        )
        order by pp.apellido_usuario, pp.nombre_usuario
      )
      from por_profesional pp
    ), '[]'::jsonb),
    'pacientes_nuevos', (
      select count(*)
      from public.paciente pa
      where (pa.creado at time zone 'America/Argentina/Buenos_Aires')::date
            between p_desde and p_hasta
    )
  )
  into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.fn_consultar_indicadores_generales(date, date)
  from public, anon;
grant execute on function public.fn_consultar_indicadores_generales(date, date)
  to authenticated;
