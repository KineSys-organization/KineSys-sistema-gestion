-- HU-15. Dashboard del profesional (Inicio del Profesional).
--
-- Una sola función de solo lectura, para el Profesional logueado (auth.uid()):
--   * dia: turnos de hoy (hora de Argentina) sin contar los cancelados, cuántos están
--     atendidos y cuántos pendientes (confirmados todavía sin atender).
--   * semana: lunes a domingo de la semana de hoy; cancelaciones y ausencias de sus turnos
--     (por el día del turno, no por cuándo se canceló).
--   * mes: sus turnos del mes pedido (todos los estados), para el calendario mensual.
-- El id del profesional nunca viene como parámetro: sale de la sesión.
-- No crea tablas ni toca las existentes.

create or replace function public.fn_consultar_dashboard_profesional(p_mes date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profesional uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_lunes date;
  v_mes_desde date;
  v_mes_hasta date;
begin
  perform public.fn_exigir_rol(array['Profesional']);
  v_profesional := auth.uid();

  -- isodow: lunes = 1 ... domingo = 7.
  v_lunes := v_hoy - (extract(isodow from v_hoy)::int - 1);

  -- Sin mes pedido: el mes de hoy. Cualquier día del mes sirve.
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
      )
    )
  );
end;
$$;

revoke all on function public.fn_consultar_dashboard_profesional(date) from public, anon;
grant execute on function public.fn_consultar_dashboard_profesional(date) to authenticated;

notify pgrst, 'reload schema';
