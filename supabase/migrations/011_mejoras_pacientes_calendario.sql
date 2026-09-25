-- Mejoras de UX: filtros de pacientes y calendario de disponibilidad.
-- Solo agrega dos funciones nuevas. No cambia tablas ni reemplaza funciones existentes
-- (fn_buscar_pacientes sigue igual: la usa el paso "Paciente" de otorgar turno).
begin;

-- Pacientes: listado con filtros. Todos los filtros son opcionales; sin ninguno lista
-- los primeros 100 pacientes activos por apellido.
--   p_texto: DNI exacto (si son solo dígitos) o parte del nombre / apellido.
--   p_obra:  null = todas; 'particular' = sin obra social; uuid = pacientes con esa obra.
--   p_edad_min / p_edad_max: rango de edad cumplida (hora de Argentina), inclusivo.
create or replace function public.fn_filtrar_pacientes(
  p_texto text default null,
  p_obra text default null,
  p_edad_min integer default null,
  p_edad_max integer default null
)
returns table (
  id_paciente uuid,
  nombre_paciente text,
  apellido_paciente text,
  dni_paciente integer,
  fecha_nacimiento_paciente date,
  telefono_paciente text,
  mail_paciente text,
  edad integer,
  obras_sociales jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_texto text := trim(coalesce(p_texto, ''));
  v_obra text := nullif(trim(coalesce(p_obra, '')), '');
  v_id_obra uuid;
  v_dni integer;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para buscar pacientes';
  end if;

  if p_edad_min is not null and p_edad_min < 0
    or p_edad_max is not null and p_edad_max < 0 then
    raise exception 'La edad no puede ser negativa';
  end if;

  if p_edad_min is not null and p_edad_max is not null and p_edad_min > p_edad_max then
    raise exception 'La edad mínima no puede ser mayor que la máxima';
  end if;

  if v_obra is not null and v_obra <> 'particular' then
    begin
      v_id_obra := v_obra::uuid;
    exception when others then
      raise exception 'Obra social inválida';
    end;
  end if;

  if v_texto ~ '^\d{1,9}$' then
    v_dni := v_texto::integer;
  end if;

  return query
    select
      p.id_paciente,
      p.nombre_paciente,
      p.apellido_paciente,
      p.dni_paciente,
      p.fecha_nacimiento_paciente,
      p.telefono_paciente,
      p.mail_paciente,
      extract(year from age(v_hoy, p.fecha_nacimiento_paciente))::integer as edad,
      public.fn_obras_de_paciente(p.id_paciente) as obras_sociales
    from public.paciente p
    where p.activo = true
      -- Texto: DNI exacto o nombre / apellido.
      and (
        v_texto = ''
        or (v_dni is not null and p.dni_paciente = v_dni)
        or (
          v_dni is null
          and (
            p.nombre_paciente ilike '%' || v_texto || '%'
            or p.apellido_paciente ilike '%' || v_texto || '%'
            or (p.apellido_paciente || ' ' || p.nombre_paciente) ilike '%' || v_texto || '%'
            or (p.nombre_paciente || ' ' || p.apellido_paciente) ilike '%' || v_texto || '%'
          )
        )
      )
      -- Obra social.
      and (
        v_obra is null
        or (v_obra = 'particular' and not exists (
          select 1 from public.paciente_obra_social pos where pos.id_paciente = p.id_paciente
        ))
        or (v_id_obra is not null and exists (
          select 1 from public.paciente_obra_social pos
          where pos.id_paciente = p.id_paciente and pos.id_obra_social = v_id_obra
        ))
      )
      -- Rango etario.
      and (p_edad_min is null or extract(year from age(v_hoy, p.fecha_nacimiento_paciente)) >= p_edad_min)
      and (p_edad_max is null or extract(year from age(v_hoy, p.fecha_nacimiento_paciente)) <= p_edad_max)
    order by p.apellido_paciente, p.nombre_paciente
    limit 100;
end;
$$;

-- Disponibilidad: cuántos horarios libres hay cada día, de hoy a hoy + 30
-- (la misma ventana que HU-05). Reutiliza fn_consultar_disponibilidad día por día,
-- así que respeta franjas, duración, turnos ocupados y horarios pasados.
create or replace function public.fn_consultar_disponibilidad_calendario(
  p_id_profesional uuid,
  p_id_servicio uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_dia date;
  v_disp jsonb;
  v_dias jsonb := '[]'::jsonb;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar disponibilidad';
  end if;

  if p_id_profesional is null or p_id_servicio is null then
    raise exception 'Faltan campos';
  end if;

  for v_dia in
    select d::date from generate_series(v_hoy, v_hoy + 30, interval '1 day') d
  loop
    -- Valida profesional y servicio (si fallan, corta en el primer día).
    v_disp := public.fn_consultar_disponibilidad(p_id_profesional, p_id_servicio, v_dia);
    v_dias := v_dias || jsonb_build_array(jsonb_build_object(
      'fecha', v_dia,
      'libres', jsonb_array_length(v_disp -> 'horarios')
    ));
  end loop;

  return jsonb_build_object(
    'desde', v_hoy,
    'hasta', v_hoy + 30,
    'nombre_profesional', v_disp ->> 'nombre_profesional',
    'apellido_profesional', v_disp ->> 'apellido_profesional',
    'nombre_servicio', v_disp ->> 'nombre_servicio',
    'duracion_minutos', (v_disp ->> 'duracion_minutos')::integer,
    'dias', v_dias
  );
end;
$$;

revoke all on function public.fn_filtrar_pacientes(text, text, integer, integer) from public, anon;
revoke all on function public.fn_consultar_disponibilidad_calendario(uuid, uuid) from public, anon;
grant execute on function public.fn_filtrar_pacientes(text, text, integer, integer) to authenticated;
grant execute on function public.fn_consultar_disponibilidad_calendario(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
