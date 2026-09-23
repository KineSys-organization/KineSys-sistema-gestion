-- HU-04. Extiende el esquema existente de pacientes (no recrea public.paciente).
-- Conserva fn_completar_registro_paciente (web de pacientes) y la columna texto obra_social legacy.
-- Reemplaza fn_registrar_paciente del mostrador por la versión de gestión (mail + obras N:M).

-- Mail para recepción / HU-04 (antes no existía en paciente).
alter table public.paciente
  add column if not exists mail_paciente text;

alter table public.paciente
  drop constraint if exists paciente_mail_formato;

alter table public.paciente
  add constraint paciente_mail_formato check (
    mail_paciente is null
    or mail_paciente ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

-- Catálogo fijo de obras sociales (administración fuera de alcance).
create table if not exists public.obra_social (
  id_obra_social uuid primary key default gen_random_uuid(),
  nombre_obra_social text not null,
  activo boolean not null default true,
  constraint obra_social_nombre_unico unique (nombre_obra_social)
);

create table if not exists public.paciente_obra_social (
  id_paciente uuid not null references public.paciente (id_paciente) on delete cascade,
  id_obra_social uuid not null references public.obra_social (id_obra_social),
  numero_afiliado text not null,
  primary key (id_paciente, id_obra_social),
  constraint paciente_obra_afiliado_no_vacio check (length(trim(numero_afiliado)) > 0)
);

alter table public.obra_social enable row level security;
alter table public.paciente_obra_social enable row level security;

revoke all on public.obra_social from public, anon, authenticated;
revoke all on public.paciente_obra_social from public, anon, authenticated;

insert into public.obra_social (nombre_obra_social)
values
  ('OSDE'),
  ('Swiss Medical'),
  ('Galeno'),
  ('Medicus'),
  ('IOMA'),
  ('PAMI'),
  ('Omint'),
  ('Sancor Salud'),
  ('Accord Salud'),
  ('Unión Personal')
on conflict (nombre_obra_social) do nothing;

create or replace function public.fn_es_recepcion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario u
    where u.id_usuario = auth.uid()
      and u.activo = true
      and u.rol_usuario in ('Gerente', 'Mesa de Entradas')
  );
$$;

create or replace function public.fn_listar_obras_sociales()
returns table (
  id_obra_social uuid,
  nombre_obra_social text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar obras sociales';
  end if;

  return query
    select o.id_obra_social, o.nombre_obra_social
    from public.obra_social o
    where o.activo = true
    order by o.nombre_obra_social;
end;
$$;

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
          'numero_afiliado', pos.numero_afiliado
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

create or replace function public.fn_buscar_pacientes(p_texto text default null)
returns table (
  id_paciente uuid,
  nombre_paciente text,
  apellido_paciente text,
  dni_paciente integer,
  fecha_nacimiento_paciente date,
  telefono_paciente text,
  mail_paciente text,
  obras_sociales jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_texto text := trim(coalesce(p_texto, ''));
  v_dni integer;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para buscar pacientes';
  end if;

  if v_texto = '' then
    return;
  end if;

  if v_texto ~ '^\d+$' then
    begin
      v_dni := v_texto::integer;
    exception when others then
      v_dni := null;
    end;
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
      public.fn_obras_de_paciente(p.id_paciente) as obras_sociales
    from public.paciente p
    where p.activo = true
      and (
        (v_dni is not null and p.dni_paciente = v_dni)
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
    order by p.apellido_paciente, p.nombre_paciente
    limit 50;
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
    'obras_sociales', public.fn_obras_de_paciente(p.id_paciente)
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

create or replace function public.fn_asociar_obras_paciente(
  p_id_paciente uuid,
  p_obras jsonb
)
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
begin
  if p_obras is null or jsonb_typeof(p_obras) <> 'array' then
    raise exception 'El formato de obras sociales no es válido';
  end if;

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

    select o.nombre_obra_social into v_nombre
    from public.obra_social o
    where o.id_obra_social = v_id and o.activo = true;

    if v_nombre is null then
      raise exception 'La obra social no existe o no está activa';
    end if;

    insert into public.paciente_obra_social (id_paciente, id_obra_social, numero_afiliado)
    values (p_id_paciente, v_id, v_afiliado);

    v_vistos := array_append(v_vistos, v_id);
    v_nombres := array_append(v_nombres, v_nombre);
  end loop;

  -- Compatibilidad con la columna texto legacy (web de pacientes / lecturas viejas).
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

-- Quita la firma vieja del mostrador (texto obra_social) para no dejar dos comportamientos.
drop function if exists public.fn_registrar_paciente(text, text, integer, date, text, text);

create or replace function public.fn_registrar_paciente(
  p_nombre text,
  p_apellido text,
  p_dni integer,
  p_fecha_nacimiento date,
  p_telefono text,
  p_mail text,
  p_obras jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existente public.paciente%rowtype;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para registrar pacientes';
  end if;

  if trim(coalesce(p_nombre, '')) = ''
    or trim(coalesce(p_apellido, '')) = ''
    or trim(coalesce(p_telefono, '')) = ''
    or trim(coalesce(p_mail, '')) = ''
    or p_dni is null
    or p_fecha_nacimiento is null then
    raise exception 'Faltan campos';
  end if;

  if p_dni <= 0 then
    raise exception 'El DNI debe ser un número entero mayor a cero';
  end if;

  if p_fecha_nacimiento > current_date then
    raise exception 'La fecha de nacimiento no puede ser futura';
  end if;

  if trim(p_mail) !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'El mail no es válido';
  end if;

  select * into v_existente
  from public.paciente
  where dni_paciente = p_dni;

  if found then
    raise exception
      'Ya existe un paciente con ese DNI: %, % (DNI %)',
      v_existente.apellido_paciente,
      v_existente.nombre_paciente,
      v_existente.dni_paciente;
  end if;

  insert into public.paciente (
    nombre_paciente,
    apellido_paciente,
    dni_paciente,
    fecha_nacimiento_paciente,
    telefono_paciente,
    mail_paciente
  )
  values (
    trim(p_nombre),
    trim(p_apellido),
    p_dni,
    p_fecha_nacimiento,
    trim(p_telefono),
    lower(trim(p_mail))
  )
  returning id_paciente into v_id;

  perform public.fn_asociar_obras_paciente(v_id, coalesce(p_obras, '[]'::jsonb));

  return v_id;
end;
$$;

create or replace function public.fn_editar_paciente(
  p_id_paciente uuid,
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_mail text,
  p_obras jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para editar pacientes';
  end if;

  if not exists (select 1 from public.paciente where id_paciente = p_id_paciente) then
    raise exception 'El paciente no existe';
  end if;

  if trim(coalesce(p_nombre, '')) = ''
    or trim(coalesce(p_apellido, '')) = ''
    or trim(coalesce(p_telefono, '')) = ''
    or trim(coalesce(p_mail, '')) = '' then
    raise exception 'Faltan campos';
  end if;

  if trim(p_mail) !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'El mail no es válido';
  end if;

  -- DNI y fecha de nacimiento no se modifican (criterio HU-04).
  update public.paciente
  set
    nombre_paciente = trim(p_nombre),
    apellido_paciente = trim(p_apellido),
    telefono_paciente = trim(p_telefono),
    mail_paciente = lower(trim(p_mail)),
    editado = now()
  where id_paciente = p_id_paciente;

  perform public.fn_asociar_obras_paciente(p_id_paciente, coalesce(p_obras, '[]'::jsonb));
end;
$$;

revoke all on function public.fn_es_recepcion() from public, anon, authenticated;
revoke all on function public.fn_obras_de_paciente(uuid) from public, anon, authenticated;
revoke all on function public.fn_asociar_obras_paciente(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_listar_obras_sociales() from public, anon;
revoke all on function public.fn_buscar_pacientes(text) from public, anon;
revoke all on function public.fn_obtener_paciente(uuid) from public, anon;
revoke all on function public.fn_registrar_paciente(text, text, integer, date, text, text, jsonb) from public, anon;
revoke all on function public.fn_editar_paciente(uuid, text, text, text, text, jsonb) from public, anon;

grant execute on function public.fn_listar_obras_sociales() to authenticated;
grant execute on function public.fn_buscar_pacientes(text) to authenticated;
grant execute on function public.fn_obtener_paciente(uuid) to authenticated;
grant execute on function public.fn_registrar_paciente(text, text, integer, date, text, text, jsonb) to authenticated;
grant execute on function public.fn_editar_paciente(uuid, text, text, text, text, jsonb) to authenticated;
