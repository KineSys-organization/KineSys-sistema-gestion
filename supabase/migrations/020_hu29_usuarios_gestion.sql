-- HU-29: listado de usuarios internos, sin exponer profesionales ni pacientes.
create or replace function public.fn_listar_usuarios_gestion()
returns table (
  id_usuario uuid,
  nombre_usuario text,
  apellido_usuario text,
  mail_usuario text,
  rol_usuario public.rol_usuario_enum,
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
    select u.id_usuario, u.nombre_usuario, u.apellido_usuario,
           coalesce(auth_user.email, u.mail_usuario)::text, u.rol_usuario, u.activo
    from public.usuario u
    left join auth.users auth_user on auth_user.id = u.id_usuario
    where u.rol_usuario in ('Gerente', 'Mesa de Entradas')
    order by u.apellido_usuario, u.nombre_usuario;
end;
$$;

revoke all on function public.fn_listar_usuarios_gestion() from public, anon;
grant execute on function public.fn_listar_usuarios_gestion() to authenticated;
