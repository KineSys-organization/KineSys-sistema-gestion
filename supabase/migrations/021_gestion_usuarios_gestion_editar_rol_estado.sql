-- Gestión de usuarios de gestión (Gerente / Mesa de Entradas) sobre /usuarios.
-- Aplicada en Supabase como gestion_usuarios_gestion_editar_rol_estado. No re-ejecutar.
-- Todas: solo Gerente activo (fn_exigir_rol), sin tocar Auth, sin borrar filas.

-- 1) Obtener un usuario de gestión (para la pantalla de edición)
create or replace function public.fn_obtener_usuario_gestion(p_id_usuario uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  select jsonb_build_object(
    'id_usuario', u.id_usuario,
    'nombre_usuario', u.nombre_usuario,
    'apellido_usuario', u.apellido_usuario,
    'dni_usuario', u.dni_usuario,
    'fecha_nacimiento_usuario', u.fecha_nacimiento_usuario,
    'telefono_usuario', u.telefono_usuario,
    'mail_usuario', coalesce(a.email, u.mail_usuario),
    'rol_usuario', u.rol_usuario,
    'activo', u.activo,
    'es_usuario_actual', (u.id_usuario = auth.uid()),
    'es_ultimo_gerente_activo', (
      u.rol_usuario = 'Gerente' and u.activo
      and not exists (
        select 1 from public.usuario o
        where o.rol_usuario = 'Gerente' and o.activo and o.id_usuario <> u.id_usuario
      )
    )
  )
  into v_resultado
  from public.usuario u
  left join auth.users a on a.id = u.id_usuario
  where u.id_usuario = p_id_usuario
    and u.rol_usuario in ('Gerente', 'Mesa de Entradas');

  if v_resultado is null then
    raise exception 'El usuario no existe o no es un usuario de gestión';
  end if;

  return v_resultado;
end;
$$;

-- 2) Editar datos: nombre, apellido y teléfono (DNI, fecha de nacimiento y mail no se editan)
create or replace function public.fn_editar_usuario_gestion(
  p_id_usuario uuid,
  p_nombre text,
  p_apellido text,
  p_telefono text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_nombre is null or trim(p_nombre) = ''
     or p_apellido is null or trim(p_apellido) = ''
     or p_telefono is null or trim(p_telefono) = '' then
    raise exception 'Nombre, apellido y teléfono son obligatorios';
  end if;

  perform 1
  from public.usuario
  where id_usuario = p_id_usuario
    and rol_usuario in ('Gerente', 'Mesa de Entradas')
  for update;

  if not found then
    raise exception 'El usuario no existe o no es un usuario de gestión';
  end if;

  update public.usuario
  set nombre_usuario = trim(p_nombre),
      apellido_usuario = trim(p_apellido),
      telefono_usuario = trim(p_telefono)
  where id_usuario = p_id_usuario;

  return public.fn_obtener_usuario_gestion(p_id_usuario);
end;
$$;

-- 3) Cambiar rol: solo entre Gerente y Mesa de Entradas
create or replace function public.fn_cambiar_rol_usuario_gestion(
  p_id_usuario uuid,
  p_rol text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol_actual public.rol_usuario_enum;
  v_rol_nuevo public.rol_usuario_enum;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_rol is null or p_rol not in ('Gerente', 'Mesa de Entradas') then
    raise exception 'El rol solo puede ser Gerente o Mesa de Entradas';
  end if;
  v_rol_nuevo := p_rol::public.rol_usuario_enum;

  perform pg_advisory_xact_lock(hashtext('usuario_gestion_gerentes'));

  select rol_usuario into v_rol_actual
  from public.usuario
  where id_usuario = p_id_usuario
    and rol_usuario in ('Gerente', 'Mesa de Entradas')
  for update;

  if not found then
    raise exception 'El usuario no existe o no es un usuario de gestión';
  end if;

  if v_rol_actual = v_rol_nuevo then
    return public.fn_obtener_usuario_gestion(p_id_usuario);
  end if;

  if v_rol_actual = 'Gerente' and v_rol_nuevo = 'Mesa de Entradas'
     and not exists (
       select 1 from public.usuario
       where rol_usuario = 'Gerente' and activo and id_usuario <> p_id_usuario
     ) then
    if p_id_usuario = auth.uid() then
      raise exception 'No podés bajarte de rol: sos el único Gerente activo. Asigná otro Gerente antes.';
    else
      raise exception 'No se puede bajar de rol al último Gerente activo. Tiene que quedar al menos un Gerente activo.';
    end if;
  end if;

  update public.usuario
  set rol_usuario = v_rol_nuevo
  where id_usuario = p_id_usuario;

  return public.fn_obtener_usuario_gestion(p_id_usuario);
end;
$$;

-- 4) Activar / desactivar (no borra filas ni toca la cuenta de Auth; no cancela turnos)
create or replace function public.fn_cambiar_estado_usuario_gestion(
  p_id_usuario uuid,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol_actual public.rol_usuario_enum;
  v_activo_actual boolean;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_activo is null then
    raise exception 'Indicá si el usuario debe quedar activo o inactivo';
  end if;

  perform pg_advisory_xact_lock(hashtext('usuario_gestion_gerentes'));

  select rol_usuario, activo into v_rol_actual, v_activo_actual
  from public.usuario
  where id_usuario = p_id_usuario
    and rol_usuario in ('Gerente', 'Mesa de Entradas')
  for update;

  if not found then
    raise exception 'El usuario no existe o no es un usuario de gestión';
  end if;

  if v_activo_actual = p_activo then
    return public.fn_obtener_usuario_gestion(p_id_usuario);
  end if;

  if p_activo = false and v_rol_actual = 'Gerente'
     and not exists (
       select 1 from public.usuario
       where rol_usuario = 'Gerente' and activo and id_usuario <> p_id_usuario
     ) then
    if p_id_usuario = auth.uid() then
      raise exception 'No podés desactivarte: sos el único Gerente activo. Activá o creá otro Gerente antes.';
    else
      raise exception 'No se puede desactivar al último Gerente activo. Tiene que quedar al menos un Gerente activo.';
    end if;
  end if;

  update public.usuario
  set activo = p_activo
  where id_usuario = p_id_usuario;

  return public.fn_obtener_usuario_gestion(p_id_usuario);
end;
$$;

revoke all on function public.fn_obtener_usuario_gestion(uuid) from public, anon;
revoke all on function public.fn_editar_usuario_gestion(uuid, text, text, text) from public, anon;
revoke all on function public.fn_cambiar_rol_usuario_gestion(uuid, text) from public, anon;
revoke all on function public.fn_cambiar_estado_usuario_gestion(uuid, boolean) from public, anon;

grant execute on function public.fn_obtener_usuario_gestion(uuid) to authenticated, service_role;
grant execute on function public.fn_editar_usuario_gestion(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.fn_cambiar_rol_usuario_gestion(uuid, text) to authenticated, service_role;
grant execute on function public.fn_cambiar_estado_usuario_gestion(uuid, boolean) to authenticated, service_role;
