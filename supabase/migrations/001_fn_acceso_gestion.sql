create or replace function public.fn_acceso_gestion()
returns table (
  id_usuario uuid,
  nombre_usuario text,
  apellido_usuario text,
  rol_usuario public.rol_usuario_enum
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  return query
    select u.id_usuario, u.nombre_usuario, u.apellido_usuario, u.rol_usuario
    from public.usuario u
    where u.id_usuario = auth.uid()
      and u.activo = true
      and u.rol_usuario in ('Gerente', 'Profesional', 'Mesa de Entradas');

  if not found then
    raise exception 'No tenés permiso para acceder al sistema de gestión';
  end if;
end;
$$;

revoke all on function public.fn_acceso_gestion() from public, anon;
grant execute on function public.fn_acceso_gestion() to authenticated;
