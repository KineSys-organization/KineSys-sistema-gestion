-- HU-34. Activar o desactivar pacientes sin borrar información ni afectar turnos.
begin;

-- Se reemplaza la firma anterior para sumar el filtro de estado sin dejar una
-- sobrecarga ambigua para las llamadas RPC con parámetros nombrados.
drop function if exists public.fn_filtrar_pacientes(text, text, integer, integer);

create function public.fn_filtrar_pacientes(
  p_texto text default null,
  p_obra text default null,
  p_edad_min integer default null,
  p_edad_max integer default null,
  p_estado text default 'activos'
)
returns table (
  id_paciente uuid,
  nombre_paciente text,
  apellido_paciente text,
  dni_paciente integer,
  fecha_nacimiento_paciente date,
  telefono_paciente text,
  mail_paciente text,
  activo boolean,
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
  v_estado text := lower(trim(coalesce(p_estado, 'activos')));
  v_id_obra uuid;
  v_dni integer;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para buscar pacientes';
  end if;

  if v_estado not in ('activos', 'inactivos', 'todos') then
    raise exception 'Estado de paciente inválido';
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
      p.activo,
      extract(year from age(v_hoy, p.fecha_nacimiento_paciente))::integer as edad,
      public.fn_obras_de_paciente(p.id_paciente) as obras_sociales
    from public.paciente p
    where (v_estado = 'todos' or p.activo = (v_estado = 'activos'))
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
      and (p_edad_min is null or extract(year from age(v_hoy, p.fecha_nacimiento_paciente)) >= p_edad_min)
      and (p_edad_max is null or extract(year from age(v_hoy, p.fecha_nacimiento_paciente)) <= p_edad_max)
    order by p.apellido_paciente, p.nombre_paciente
    limit 100;
end;
$$;

create or replace function public.fn_obtener_paciente(p_id_paciente uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_ahora time := (timezone('America/Argentina/Buenos_Aires', now()))::time;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar pacientes';
  end if;

  select jsonb_build_object(
    'id_paciente', p.id_paciente,
    'nombre_paciente', p.nombre_paciente,
    'apellido_paciente', p.apellido_paciente,
    'dni_paciente', p.dni_paciente,
    'fecha_nacimiento_paciente', p.fecha_nacimiento_paciente,
    'telefono_paciente', coalesce(p.telefono_paciente, ''),
    'mail_paciente', coalesce(p.mail_paciente, ''),
    'activo', p.activo,
    'obras_sociales', public.fn_obras_de_paciente(p.id_paciente),
    'turnos_confirmados_futuros', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id_turno', t.id_turno,
          'fecha', t.fecha,
          'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
          'nombre_profesional', u.nombre_usuario,
          'apellido_profesional', u.apellido_usuario,
          'nombre_servicio', s.nombre_servicio
        ) order by t.fecha, t.hora_inicio
      )
      from public.turno t
      join public.usuario u on u.id_usuario = t.id_profesional
      join public.servicio s on s.id_servicio = t.id_servicio
      where t.id_paciente = p.id_paciente
        and t.estado = 'confirmado'
        and (t.fecha > v_hoy or (t.fecha = v_hoy and t.hora_inicio > v_ahora))
    ), '[]'::jsonb)
  )
  into v_resultado
  from public.paciente p
  where p.id_paciente = p_id_paciente;

  if v_resultado is null then
    raise exception 'El paciente no existe';
  end if;

  return v_resultado;
end;
$$;

create or replace function public.fn_cambiar_estado_paciente(
  p_id_paciente uuid,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permisos para realizar esta acción';
  end if;

  if p_id_paciente is null or p_activo is null then
    raise exception 'Faltan campos';
  end if;

  update public.paciente
  set activo = p_activo,
      editado = now()
  where id_paciente = p_id_paciente;

  if not found then
    raise exception 'El paciente no existe';
  end if;
end;
$$;

revoke all on function public.fn_filtrar_pacientes(text, text, integer, integer, text) from public, anon;
revoke all on function public.fn_obtener_paciente(uuid) from public, anon;
revoke all on function public.fn_cambiar_estado_paciente(uuid, boolean) from public, anon;
grant execute on function public.fn_filtrar_pacientes(text, text, integer, integer, text) to authenticated;
grant execute on function public.fn_obtener_paciente(uuid) to authenticated;
grant execute on function public.fn_cambiar_estado_paciente(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
