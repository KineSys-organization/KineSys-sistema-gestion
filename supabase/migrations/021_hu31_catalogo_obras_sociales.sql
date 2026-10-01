-- HU-31: administración del catálogo de obras sociales por Gerencia.
-- La unicidad original es case-sensitive; este índice también evita duplicados por mayúsculas
-- o espacios periféricos, sin modificar las filas existentes.
do $$
begin
  if exists (
    select 1
    from public.obra_social
    group by lower(trim(nombre_obra_social))
    having count(*) > 1
  ) then
    raise exception 'Hay obras sociales duplicadas al ignorar mayúsculas y espacios; corregilas antes de aplicar HU-31';
  end if;
end;
$$;

create unique index if not exists obra_social_nombre_normalizado_unico
  on public.obra_social (lower(trim(nombre_obra_social)));

create or replace function public.fn_listar_obras_sociales_gestion()
returns table (
  id_obra_social uuid,
  nombre_obra_social text,
  activo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_exigir_rol(array['Gerente']);

  return query
    select o.id_obra_social, o.nombre_obra_social, o.activo
    from public.obra_social o
    order by o.nombre_obra_social;
end;
$$;

create or replace function public.fn_registrar_obra_social(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_id uuid;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if char_length(v_nombre) < 2 or char_length(v_nombre) > 80 then
    raise exception 'El nombre debe tener entre 2 y 80 caracteres';
  end if;

  begin
    insert into public.obra_social (nombre_obra_social, activo)
    values (v_nombre, true)
    returning id_obra_social into v_id;
  exception when unique_violation then
    raise exception 'Ya existe una obra social con ese nombre' using errcode = '23505';
  end;

  return v_id;
end;
$$;

revoke all on function public.fn_listar_obras_sociales_gestion() from public, anon;
revoke all on function public.fn_registrar_obra_social(text) from public, anon;
grant execute on function public.fn_listar_obras_sociales_gestion() to authenticated;
grant execute on function public.fn_registrar_obra_social(text) to authenticated;

notify pgrst, 'reload schema';
