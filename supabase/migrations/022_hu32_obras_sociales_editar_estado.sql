-- Editar y activar/desactivar obras sociales del catálogo (sobre HU-31).
-- Solo Gerente (fn_exigir_rol). No se borra la fila ni se tocan pacientes/turnos.

-- 1) Editar el nombre (mismas validaciones del alta: 2 a 80 caracteres y único sin importar mayúsculas)
create or replace function public.fn_editar_obra_social(
  p_id_obra_social uuid,
  p_nombre text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_obra public.obra_social%rowtype;
  v_nombre_anterior text;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if char_length(v_nombre) < 2 or char_length(v_nombre) > 80 then
    raise exception 'El nombre debe tener entre 2 y 80 caracteres';
  end if;

  select * into v_obra
  from public.obra_social
  where id_obra_social = p_id_obra_social
  for update;

  if not found then
    raise exception 'La obra social no existe';
  end if;

  v_nombre_anterior := v_obra.nombre_obra_social;

  if v_nombre_anterior <> v_nombre then
    begin
      update public.obra_social
      set nombre_obra_social = v_nombre
      where id_obra_social = p_id_obra_social
      returning * into v_obra;
    exception when unique_violation then
      raise exception 'Ya existe una obra social con ese nombre' using errcode = '23505';
    end;

    -- paciente.obra_social guarda los nombres como texto: se actualiza para que no quede el nombre viejo
    update public.paciente p
    set obra_social = (
      select string_agg(o.nombre_obra_social, ', ' order by o.nombre_obra_social)
      from public.paciente_obra_social pos
      join public.obra_social o on o.id_obra_social = pos.id_obra_social
      where pos.id_paciente = p.id_paciente
    )
    where exists (
      select 1 from public.paciente_obra_social pos
      where pos.id_paciente = p.id_paciente and pos.id_obra_social = p_id_obra_social
    );
  end if;

  return jsonb_build_object(
    'id_obra_social', v_obra.id_obra_social,
    'nombre_obra_social', v_obra.nombre_obra_social,
    'activo', v_obra.activo
  );
end;
$$;

-- 2) Activar / desactivar (no borra la fila; no cambia coberturas guardadas ni turnos)
create or replace function public.fn_cambiar_estado_obra_social(
  p_id_obra_social uuid,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_obra public.obra_social%rowtype;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_activo is null then
    raise exception 'Indicá si la obra social debe quedar activa o inactiva';
  end if;

  select * into v_obra
  from public.obra_social
  where id_obra_social = p_id_obra_social
  for update;

  if not found then
    raise exception 'La obra social no existe';
  end if;

  if v_obra.activo <> p_activo then
    update public.obra_social
    set activo = p_activo
    where id_obra_social = p_id_obra_social
    returning * into v_obra;
  end if;

  return jsonb_build_object(
    'id_obra_social', v_obra.id_obra_social,
    'nombre_obra_social', v_obra.nombre_obra_social,
    'activo', v_obra.activo
  );
end;
$$;

revoke all on function public.fn_editar_obra_social(uuid, text) from public, anon;
revoke all on function public.fn_cambiar_estado_obra_social(uuid, boolean) from public, anon;
grant execute on function public.fn_editar_obra_social(uuid, text) to authenticated, service_role;
grant execute on function public.fn_cambiar_estado_obra_social(uuid, boolean) to authenticated, service_role;

-- 3) Pacientes: una obra inactiva que el paciente ya tiene se conserva al editar,
--    pero no se pueden sumar obras inactivas nuevas.
create or replace function public.fn_asociar_obras_paciente(p_id_paciente uuid, p_obras jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_obra jsonb;
  v_id uuid;
  v_afiliado text;
  v_vistos uuid[] := '{}';
  v_nombres text[] := '{}';
  v_nombre text;
  v_activa boolean;
  v_previas uuid[];
begin
  if p_obras is null or jsonb_typeof(p_obras) <> 'array' then
    raise exception 'El formato de obras sociales no es válido';
  end if;

  -- Obras que el paciente ya tenía antes de este cambio
  select coalesce(array_agg(pos.id_obra_social), '{}') into v_previas
  from public.paciente_obra_social pos
  where pos.id_paciente = p_id_paciente;

  delete from public.paciente_obra_social where id_paciente = p_id_paciente;

  for v_obra in select * from jsonb_array_elements(p_obras)
  loop
    begin
      v_id := (v_obra ->> 'id_obra_social')::uuid;
    exception when others then
      raise exception 'Obra social inválida';
    end;

    v_afiliado := trim(coalesce(v_obra ->> 'numero_afiliado', ''));

    if v_id is null then
      raise exception 'Obra social inválida';
    end if;

    if v_id = any (v_vistos) then
      raise exception 'No se puede asociar la misma obra social dos veces';
    end if;

    if v_afiliado = '' then
      raise exception 'El número de afiliado es obligatorio para cada obra social';
    end if;

    select o.nombre_obra_social, o.activo into v_nombre, v_activa
    from public.obra_social o
    where o.id_obra_social = v_id;

    -- Inexistente, o inactiva y que el paciente no tenía: no se puede asociar
    if v_nombre is null or (not v_activa and not (v_id = any (v_previas))) then
      raise exception 'La obra social no existe o no está activa';
    end if;

    insert into public.paciente_obra_social (id_paciente, id_obra_social, numero_afiliado)
    values (p_id_paciente, v_id, v_afiliado);

    v_vistos := array_append(v_vistos, v_id);
    v_nombres := array_append(v_nombres, v_nombre);
  end loop;

  update public.paciente
  set
    obra_social = case
      when cardinality(v_nombres) = 0 then null
      else array_to_string(v_nombres, ', ')
    end,
    editado = now()
  where id_paciente = p_id_paciente;
end;
$$;

-- 4) Las obras del paciente ahora indican si están activas (para marcarlas "inactiva" y no ofrecerlas como cobertura)
create or replace function public.fn_obras_de_paciente(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id_obra_social', pos.id_obra_social,
          'nombre_obra_social', o.nombre_obra_social,
          'numero_afiliado', pos.numero_afiliado,
          'activo', o.activo
        )
        order by o.nombre_obra_social
      )
      from public.paciente_obra_social pos
      join public.obra_social o on o.id_obra_social = pos.id_obra_social
      where pos.id_paciente = p_id
    ),
    '[]'::jsonb
  );
$$;

-- 5) Otorgar turno: no se puede elegir como cobertura una obra social inactiva
create or replace function public.fn_otorgar_turno(
  p_id_paciente uuid,
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_hora time without time zone,
  p_id_obra_social uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ahora timestamp;
  v_afiliado text;
  v_disp jsonb;
  v_duracion integer;
  v_id uuid;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para otorgar turnos';
  end if;

  if p_id_paciente is null
    or p_id_profesional is null
    or p_id_servicio is null
    or p_fecha is null
    or p_hora is null then
    raise exception 'Faltan campos';
  end if;

  -- Evita confirmar con una agenda anterior a un cambio concurrente de HU-03.
  perform 1 from public.profesional where id_usuario = p_id_profesional for update;

  -- No se otorgan turnos en el pasado (hora local de Argentina, igual que HU-05).
  v_ahora := timezone('America/Argentina/Buenos_Aires', now());
  if p_fecha + p_hora < v_ahora then
    raise exception 'No se pueden otorgar turnos con fecha anterior a la actual';
  end if;

  if not exists (
    select 1 from public.paciente
    where id_paciente = p_id_paciente and activo = true
  ) then
    raise exception 'El paciente no existe o no está activo';
  end if;

  -- La cobertura tiene que ser una obra social del paciente (o null = Particular).
  if p_id_obra_social is not null then
    select pos.numero_afiliado into v_afiliado
    from public.paciente_obra_social pos
    where pos.id_paciente = p_id_paciente
      and pos.id_obra_social = p_id_obra_social;

    if v_afiliado is null then
      raise exception 'La obra social elegida no corresponde al paciente';
    end if;

    -- Una obra inactiva se conserva en el paciente, pero no se puede usar para turnos nuevos
    if not exists (
      select 1 from public.obra_social o
      where o.id_obra_social = p_id_obra_social and o.activo = true
    ) then
      raise exception 'La obra social elegida está inactiva y no se puede usar como cobertura';
    end if;
  end if;

  -- Dos confirmaciones del mismo profesional y día se atienden de a una:
  -- la segunda espera acá y después ya ve el turno de la primera.
  perform pg_advisory_xact_lock(
    hashtextextended(p_id_profesional::text || p_fecha::text, 0)
  );

  -- Revalidación al confirmar: reutiliza HU-05 (profesional activo, servicio asociado,
  -- franja, granularidad, 30 días y ocupación). Si la hora no figura, ya no está libre.
  v_disp := public.fn_consultar_disponibilidad(p_id_profesional, p_id_servicio, p_fecha);

  if not ((v_disp -> 'horarios') ? to_char(p_hora, 'HH24:MI')) then
    raise exception 'El horario seleccionado ya no está disponible';
  end if;

  v_duracion := (v_disp ->> 'duracion_minutos')::integer;

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
      numero_afiliado
    )
    values (
      p_id_profesional,
      p_id_servicio,
      p_id_paciente,
      p_fecha,
      p_hora,
      p_hora + make_interval(mins => v_duracion),
      'confirmado',
      p_id_obra_social,
      v_afiliado
    )
    returning id_turno into v_id;
  exception when exclusion_violation then
    -- Última defensa: la restricción EXCLUDE detectó un solapamiento.
    raise exception 'El horario seleccionado ya no está disponible';
  end;

  return public.fn_obtener_turno(v_id);
end;
$$;
