-- HU-08. Autenticación y acceso interno: control de rol en la base.
--
-- Auditoría (ver docs/hu-08-autenticacion-acceso.md): todas las fn_* de HU-02B/03/04/05/06/07
-- ya validan el rol con un usuario ACTIVO (fn_es_recepcion o rol = 'Gerente' and activo).
-- Las 5 funciones de HU-01/HU-02A usaban rol_actual(), que tiene dos huecos:
--   1. No mira usuario.activo: un Gerente desactivado con token vigente podía modificar servicios.
--   2. Devuelve NULL si el usuario no tiene fila en public.usuario. `NULL not in (...)` es NULL,
--      el IF no dispara y la función sigue: cualquier cuenta de Auth sin fila en usuario
--      podía listar servicios y profesionales (con DNI, teléfono y mail).
--
-- Se agrega el helper fn_exigir_rol(text[]) y se reescriben esas 5 funciones con create or replace.
-- La lógica de negocio queda igual; solo cambia el chequeo de rol.
-- No se toca fn_completar_registro_paciente (web de pacientes) ni rol_actual() (puede usarlo RLS).

begin;

-- Helper: exige que auth.uid() sea un usuario activo con uno de los roles pedidos.
-- Devuelve el rol para quien lo quiera usar. Un NULL (sin fila, inactivo) siempre se rechaza.
create or replace function public.fn_exigir_rol(p_roles text[])
returns public.rol_usuario_enum
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol public.rol_usuario_enum;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select u.rol_usuario into v_rol
  from public.usuario u
  where u.id_usuario = auth.uid()
    and u.activo = true;

  if v_rol is null or not (v_rol::text = any (coalesce(p_roles, '{}'::text[]))) then
    raise exception 'No tenés permisos para realizar esta acción';
  end if;

  return v_rol;
end;
$$;

-- Solo lo usan otras funciones security definer (que corren como el dueño), no el front.
revoke all on function public.fn_exigir_rol(text[]) from public, anon, authenticated;

-- HU-01: listar servicios. Lo pueden los tres roles de gestión (Profesional incluido, decisión HU-08).
create or replace function public.fn_listar_servicios()
returns setof public.servicio
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas', 'Profesional']);

  return query select * from public.servicio order by nombre_servicio;
end;
$$;

-- HU-01: alta de servicio. Solo Gerente.
create or replace function public.fn_registrar_servicio(
  p_nombre text,
  p_duracion integer,
  p_granularidad integer,
  p_precio numeric default null
)
returns public.servicio
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio public.servicio;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_nombre is null or length(trim(p_nombre)) = 0 then
    raise exception 'El nombre del servicio es obligatorio';
  end if;

  if p_duracion is null or p_duracion <= 0 then
    raise exception 'La duración es obligatoria y debe ser mayor a cero';
  end if;

  if p_granularidad is null or p_granularidad <= 0 then
    raise exception 'La granularidad es obligatoria y debe ser mayor a cero';
  end if;

  begin
    insert into public.servicio (nombre_servicio, duracion_minutos, granularidad_minutos, precio_servicio, creado_por)
    values (trim(p_nombre), p_duracion, p_granularidad, p_precio, auth.uid())
    returning * into v_servicio;
  exception when unique_violation then
    raise exception 'Ya existe un servicio con ese nombre';
  end;

  return v_servicio;
end;
$$;

-- HU-01: edición de servicio. Solo Gerente.
create or replace function public.fn_editar_servicio(
  p_id_servicio uuid,
  p_nombre text,
  p_duracion integer,
  p_granularidad integer,
  p_precio numeric default null
)
returns public.servicio
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio public.servicio;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_nombre is null or length(trim(p_nombre)) = 0 then
    raise exception 'El nombre del servicio es obligatorio';
  end if;

  if p_duracion is null or p_duracion <= 0 then
    raise exception 'La duración es obligatoria y debe ser mayor a cero';
  end if;

  if p_granularidad is null or p_granularidad <= 0 then
    raise exception 'La granularidad es obligatoria y debe ser mayor a cero';
  end if;

  begin
    update public.servicio
    set nombre_servicio = trim(p_nombre),
        duracion_minutos = p_duracion,
        granularidad_minutos = p_granularidad,
        precio_servicio = p_precio
    where id_servicio = p_id_servicio
    returning * into v_servicio;
  exception when unique_violation then
    raise exception 'Ya existe un servicio con ese nombre';
  end;

  if v_servicio is null then
    raise exception 'El servicio no existe';
  end if;

  return v_servicio;
end;
$$;

-- HU-01: activar/desactivar servicio. Solo Gerente.
create or replace function public.fn_desactivar_servicio(p_id_servicio uuid)
returns public.servicio
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio public.servicio;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  update public.servicio
  set activo = not activo
  where id_servicio = p_id_servicio
  returning * into v_servicio;

  if v_servicio is null then
    raise exception 'El servicio no existe';
  end if;

  return v_servicio;
end;
$$;

-- HU-02A: listar profesionales. Lo usan Gerente (/profesionales) y Recepción (disponibilidad, agenda).
-- Profesional se mantiene como lectura (decisión HU-08).
create or replace function public.fn_listar_profesionales()
returns table (
  id_usuario uuid,
  nombre_usuario text,
  apellido_usuario text,
  dni_usuario integer,
  telefono_usuario text,
  mail_usuario text,
  matricula text,
  activo boolean,
  servicios jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas', 'Profesional']);

  return query
    select
      u.id_usuario, u.nombre_usuario, u.apellido_usuario, u.dni_usuario,
      u.telefono_usuario, u.mail_usuario, p.matricula, p.activo,
      coalesce(
        jsonb_agg(jsonb_build_object('id_servicio', s.id_servicio, 'nombre_servicio', s.nombre_servicio))
          filter (where s.id_servicio is not null),
        '[]'::jsonb
      ) as servicios
    from public.profesional p
    join public.usuario u on u.id_usuario = p.id_usuario
    left join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
    left join public.servicio s on s.id_servicio = sp.id_servicio
    group by u.id_usuario, u.nombre_usuario, u.apellido_usuario, u.dni_usuario,
             u.telefono_usuario, u.mail_usuario, p.matricula, p.activo
    order by u.apellido_usuario, u.nombre_usuario;
end;
$$;

-- create or replace conserva los permisos, pero los dejamos explícitos como en el resto de las migraciones.
revoke all on function public.fn_listar_servicios() from public, anon;
revoke all on function public.fn_registrar_servicio(text, integer, integer, numeric) from public, anon;
revoke all on function public.fn_editar_servicio(uuid, text, integer, integer, numeric) from public, anon;
revoke all on function public.fn_desactivar_servicio(uuid) from public, anon;
revoke all on function public.fn_listar_profesionales() from public, anon;

grant execute on function public.fn_listar_servicios() to authenticated;
grant execute on function public.fn_registrar_servicio(text, integer, integer, numeric) to authenticated;
grant execute on function public.fn_editar_servicio(uuid, text, integer, integer, numeric) to authenticated;
grant execute on function public.fn_desactivar_servicio(uuid) to authenticated;
grant execute on function public.fn_listar_profesionales() to authenticated;

notify pgrst, 'reload schema';

commit;
