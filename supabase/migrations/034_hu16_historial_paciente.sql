-- HU-16. Consultar historial completo del paciente.
--
-- Una sola RPC: fn_consultar_historial_paciente.
--   * Recepción / Gerente: vista administrativa (cobro, pagos, sin observaciones clínicas).
--     El Gerente además ve si el turno tiene orden médica (enlace a HU-24B).
--     Mesa de Entradas no ve órdenes.
--   * Profesional: vista clínica (atención con motivo, observaciones y orden). Sin pagos.
--     Exige al menos un turno propio con el paciente (fn_exigir_paciente_propio).
-- Resumen + listado paginado (10) con filtros de fechas y profesional.
-- Ya aplicada en el proyecto (en el historial de Supabase figura como 033_hu16_historial_paciente;
-- el archivo se renombró a 034 porque 033 ya la usa HU-19 en main).

create or replace function public.fn_consultar_historial_paciente(
  p_id_paciente uuid,
  p_desde date default null,
  p_hasta date default null,
  p_id_profesional uuid default null,
  p_pagina integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_es_recepcion boolean := public.fn_es_recepcion();
  v_es_gerente boolean := false;
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_por_pagina integer := 10;
  v_paciente jsonb;
  v_total integer;
  v_resumen jsonb;
  v_turnos jsonb;
  v_profesionales jsonb;
begin
  if p_id_paciente is null then
    raise exception 'Faltan campos';
  end if;

  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha desde no puede ser posterior a la fecha hasta';
  end if;

  if v_es_recepcion then
    perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas']);
    select exists (
      select 1 from public.usuario u
      where u.id_usuario = auth.uid()
        and u.activo = true
        and u.rol_usuario = 'Gerente'
    ) into v_es_gerente;
  else
    -- Profesional con al menos un turno con el paciente.
    perform public.fn_exigir_paciente_propio(p_id_paciente);
  end if;

  select jsonb_build_object(
    'id_paciente', pa.id_paciente,
    'nombre_paciente', pa.nombre_paciente,
    'apellido_paciente', pa.apellido_paciente,
    'dni_paciente', pa.dni_paciente
  )
  into v_paciente
  from public.paciente pa
  where pa.id_paciente = p_id_paciente;

  if v_paciente is null then
    if v_es_recepcion then
      raise exception 'El paciente no existe';
    end if;
    -- Mismo mensaje que fn_exigir_paciente_propio (no revela ids).
    raise exception 'No tenés turnos con este paciente';
  end if;

  -- Profesionales que tuvieron turnos con este paciente (para el filtro).
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id_profesional', u.id_usuario,
        'nombre', u.nombre_usuario,
        'apellido', u.apellido_usuario,
        'activo', (p.activo and u.activo and u.rol_usuario = 'Profesional')
      )
      order by u.apellido_usuario, u.nombre_usuario
    ),
    '[]'::jsonb
  )
  into v_profesionales
  from (
    select distinct t.id_profesional
    from public.turno t
    where t.id_paciente = p_id_paciente
  ) d
  join public.usuario u on u.id_usuario = d.id_profesional
  left join public.profesional p on p.id_usuario = u.id_usuario;

  select
    count(*)::integer,
    jsonb_build_object(
      'total', count(*)::integer,
      'atendidos', (count(*) filter (where t.estado = 'atendido'))::integer,
      'ausentes', (count(*) filter (where t.estado = 'ausente'))::integer,
      'cancelados', (count(*) filter (where t.estado = 'cancelado'))::integer,
      'confirmados', (count(*) filter (where t.estado = 'confirmado'))::integer
    )
  into v_total, v_resumen
  from public.turno t
  where t.id_paciente = p_id_paciente
    and (p_desde is null or t.fecha >= p_desde)
    and (p_hasta is null or t.fecha <= p_hasta)
    and (p_id_profesional is null or t.id_profesional = p_id_profesional);

  select coalesce(
    jsonb_agg(fila order by (fila ->> 'fecha') desc, (fila ->> 'hora_inicio') desc),
    '[]'::jsonb
  )
  into v_turnos
  from (
    select
      case when v_es_recepcion then
        jsonb_build_object(
          'id_turno', t.id_turno,
          'fecha', t.fecha,
          'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
          'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
          'estado', t.estado,
          'motivo_cancelacion', t.motivo_cancelacion,
          'detalle_cancelacion', t.detalle_cancelacion,
          'id_profesional', t.id_profesional,
          'nombre_profesional', u.nombre_usuario,
          'apellido_profesional', u.apellido_usuario,
          'nombre_servicio', s.nombre_servicio,
          'cobertura', coalesce(os.nombre_obra_social, 'Particular'),
          'estado_cobro', public.fn_estado_cobro(
            t.estado, pg.id_pago is not null, r.id_reembolso is not null
          ),
          'importe_final', pg.importe_final,
          'medio_pago', pg.medio_pago,
          'tiene_orden_medica', case
            when v_es_gerente then (a.orden_medica is not null and btrim(a.orden_medica) <> '')
            else null
          end,
          'atencion', null
        )
      else
        jsonb_build_object(
          'id_turno', t.id_turno,
          'fecha', t.fecha,
          'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
          'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
          'estado', t.estado,
          'motivo_cancelacion', t.motivo_cancelacion,
          'detalle_cancelacion', t.detalle_cancelacion,
          'id_profesional', t.id_profesional,
          'nombre_profesional', u.nombre_usuario,
          'apellido_profesional', u.apellido_usuario,
          'nombre_servicio', s.nombre_servicio,
          'cobertura', coalesce(os.nombre_obra_social, 'Particular'),
          'estado_cobro', null,
          'importe_final', null,
          'medio_pago', null,
          'tiene_orden_medica', (a.orden_medica is not null and btrim(a.orden_medica) <> ''),
          'atencion', case
            when a.id_atencion is not null then jsonb_build_object(
              'motivo_consulta', a.motivo_consulta,
              'observaciones', a.observaciones,
              'orden_medica', a.orden_medica
            )
            else null
          end
        )
      end as fila
    from public.turno t
    join public.usuario u on u.id_usuario = t.id_profesional
    join public.servicio s on s.id_servicio = t.id_servicio
    left join public.obra_social os on os.id_obra_social = t.id_obra_social
    left join public.pago pg on pg.id_turno = t.id_turno
    left join public.reembolso r on r.id_pago = pg.id_pago
    left join public.atencion a on a.id_turno = t.id_turno
    where t.id_paciente = p_id_paciente
      and (p_desde is null or t.fecha >= p_desde)
      and (p_hasta is null or t.fecha <= p_hasta)
      and (p_id_profesional is null or t.id_profesional = p_id_profesional)
    order by t.fecha desc, t.hora_inicio desc
    offset (v_pagina - 1) * v_por_pagina
    limit v_por_pagina
  ) pagina;

  return jsonb_build_object(
    'paciente', v_paciente,
    'vista', case when v_es_recepcion then 'administrativa' else 'clinica' end,
    'resumen', v_resumen,
    'total', v_total,
    'pagina', v_pagina,
    'por_pagina', v_por_pagina,
    'turnos', v_turnos,
    'profesionales', v_profesionales
  );
end;
$$;

revoke all on function public.fn_consultar_historial_paciente(uuid, date, date, uuid, integer)
  from public, anon;
grant execute on function public.fn_consultar_historial_paciente(uuid, date, date, uuid, integer)
  to authenticated;
