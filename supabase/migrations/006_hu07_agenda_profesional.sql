-- HU-07. Consultar la agenda de un profesional.
-- La agenda muestra los turnos confirmados de una fecha, ordenados por hora.
create or replace function public.fn_consultar_agenda_profesional(
  p_id_profesional uuid,
  p_fecha date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar la agenda';
  end if;

  if p_id_profesional is null or p_fecha is null then
    raise exception 'Faltan campos';
  end if;

  if not exists (
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

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
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
          'id_servicio', t.id_servicio,
          'nombre_servicio', s.nombre_servicio
        )
        order by t.hora_inicio
      )
      from public.turno t
      join public.paciente pa on pa.id_paciente = t.id_paciente
      join public.servicio s on s.id_servicio = t.id_servicio
      where t.id_profesional = p_id_profesional
        and t.fecha = p_fecha
        and t.estado = 'confirmado'
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.fn_consultar_agenda_profesional(uuid, date)
  from public, anon;
grant execute on function public.fn_consultar_agenda_profesional(uuid, date)
  to authenticated;
