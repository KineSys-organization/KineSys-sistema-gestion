-- HU-24B. Consultar el historial de órdenes médicas de un paciente. Issue #45.
--
-- Lee las órdenes de atencion (HU-24A / HU-38) por id_paciente (idx_atencion_paciente).
-- Solo lectura: corregir una orden sigue siendo fn_editar_atencion (HU-24A), del
-- profesional que la registró.
--
-- Quién puede verlo (amplía la regla de HU-24A):
--   * Gerente: cualquier paciente (fn_exigir_rol).
--   * Profesional: solo si tiene o tuvo al menos un turno con el paciente
--     (fn_exigir_paciente_propio de HU-39; el id sale de auth.uid(), nunca del request).
--     Ve las órdenes de TODOS los profesionales de ese paciente.
--   * Mesa de Entradas: no (No tenés permisos para realizar esta acción).
--
-- Al Gerente (y a cualquiera) solo le llega la orden: ni observaciones ni motivo.
begin;

create or replace function public.fn_listar_ordenes_paciente(
  p_id_paciente uuid,
  p_desde date default null,
  p_hasta date default null,
  p_id_profesional uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol public.rol_usuario_enum;
  v_paciente jsonb;
begin
  v_rol := public.fn_exigir_rol(array['Gerente', 'Profesional']);

  if v_rol = 'Profesional' then
    perform public.fn_exigir_paciente_propio(p_id_paciente);
  end if;

  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then
    raise exception 'La fecha Hasta no puede ser anterior a Desde';
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
    raise exception 'El paciente no existe';
  end if;

  return jsonb_build_object(
    'paciente', v_paciente,

    -- Para el filtro "Profesional": los que alguna vez le dieron una orden (sin filtros).
    'profesionales', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id_profesional', x.id_profesional,
          'nombre_profesional', x.nombre_usuario,
          'apellido_profesional', x.apellido_usuario
        )
        order by x.apellido_usuario, x.nombre_usuario
      )
      from (
        select distinct a.id_profesional, u.nombre_usuario, u.apellido_usuario
        from public.atencion a
        join public.usuario u on u.id_usuario = a.id_profesional
        where a.id_paciente = p_id_paciente
          and a.orden_medica is not null
      ) x
    ), '[]'::jsonb),

    -- Para distinguir "no tiene órdenes" de "no hay órdenes para esos filtros".
    'total_sin_filtros', (
      select count(*)
      from public.atencion a
      where a.id_paciente = p_id_paciente
        and a.orden_medica is not null
    ),

    -- De la más reciente a la más antigua (fecha y hora del turno).
    'ordenes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id_atencion', a.id_atencion,
          'id_turno', t.id_turno,
          'fecha', t.fecha,
          'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
          'id_profesional', a.id_profesional,
          'nombre_profesional', u.nombre_usuario,
          'apellido_profesional', u.apellido_usuario,
          'matricula_profesional', pr.matricula,
          'nombre_servicio', s.nombre_servicio,
          'cobertura', coalesce(o.nombre_obra_social, 'Particular'),
          'numero_afiliado', t.numero_afiliado,
          'orden_sesiones', a.orden_sesiones,
          'orden_medica', a.orden_medica,
          'registrado_en', a.registrado_en,
          'editado_en', a.editado_en
        )
        order by t.fecha desc, t.hora_inicio desc
      )
      from public.atencion a
      join public.turno t on t.id_turno = a.id_turno
      join public.usuario u on u.id_usuario = a.id_profesional
      join public.servicio s on s.id_servicio = t.id_servicio
      left join public.profesional pr on pr.id_usuario = a.id_profesional
      left join public.obra_social o on o.id_obra_social = t.id_obra_social
      where a.id_paciente = p_id_paciente
        and a.orden_medica is not null
        and (p_desde is null or t.fecha >= p_desde)
        and (p_hasta is null or t.fecha <= p_hasta)
        and (p_id_profesional is null or a.id_profesional = p_id_profesional)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fn_listar_ordenes_paciente(uuid, date, date, uuid) from public, anon;
grant execute on function public.fn_listar_ordenes_paciente(uuid, date, date, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
