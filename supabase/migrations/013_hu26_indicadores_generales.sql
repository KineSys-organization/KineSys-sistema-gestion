-- HU-26. Indicadores generales del centro, vista corta del Incremento 2 (solo Gerente).
--
-- Para un período desde/hasta (fechas de Argentina, ambos incluidos) devuelve:
--   * Turnos cuyo día cae en el período: total y por estado (confirmados, atendidos, cancelados,
--     ausentes). Cada turno cuenta una vez, en el estado que tiene al consultar.
--   * Pacientes nuevos: altas de paciente (paciente.creado, hora de Argentina) en el período.
-- Un período sin datos devuelve todo en cero (no es un error).
-- Ocupación, desglose por profesional/servicio y pacientes recurrentes son de HU-18 (Incremento 3).
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

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'turnos', (
      select jsonb_build_object(
        'total', count(*),
        'confirmados', count(*) filter (where t.estado = 'confirmado'),
        'atendidos', count(*) filter (where t.estado = 'atendido'),
        'cancelados', count(*) filter (where t.estado = 'cancelado'),
        'ausentes', count(*) filter (where t.estado = 'ausente')
      )
      from public.turno t
      where t.fecha between p_desde and p_hasta
    ),
    'pacientes_nuevos', (
      select count(*)
      from public.paciente pa
      where (pa.creado at time zone 'America/Argentina/Buenos_Aires')::date
            between p_desde and p_hasta
    )
  );
end;
$$;

revoke all on function public.fn_consultar_indicadores_generales(date, date)
  from public, anon;
grant execute on function public.fn_consultar_indicadores_generales(date, date)
  to authenticated;
