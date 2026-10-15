-- HU-18 (corrección). Ocupación del centro con los mismos profesionales arriba y abajo.
-- Antes los minutos ocupados sumaban también a los profesionales inactivos, pero los
-- disponibles solo a los activos: el porcentaje del centro se inflaba (podía pasar de 100%).
-- Ahora el centro usa solo profesionales activos en los dos lados, igual que su fila
-- ("Inactivo · no computa"). El inactivo sigue en la tabla con sus turnos y minutos.
-- Parte de la versión de 20261013050518_hu18_dashboard_operativo.sql; solo cambia ocupacion_centro.

create or replace function public.fn_consultar_dashboard_operativo(
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
          sum(extract(epoch from (f.hora_fin - f.hora_inicio)) / 60),
          0
        )::integer as minutos_disponibles
      from profesionales_activos pa
      cross join fechas d
      left join public.franja_profesional f
        on f.id_usuario = pa.id_usuario
        and f.dia_semana = extract(isodow from d.fecha)::integer
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
$$;

revoke all on function public.fn_consultar_dashboard_operativo(date, date)
  from public, anon;
grant execute on function public.fn_consultar_dashboard_operativo(date, date)
  to authenticated;
