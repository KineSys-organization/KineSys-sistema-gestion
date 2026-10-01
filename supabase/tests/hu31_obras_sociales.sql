-- Pruebas HU-31. Requieren la migración 021 aplicada y la cuenta de prueba Gerente; todo se revierte.
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_nombre text := 'HU31 Prueba ' || left(gen_random_uuid()::text, 8);
  v_id uuid;
  v_count integer;
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  if v_gerente is null or v_mesa is null then
    raise exception 'Faltan las cuentas de prueba Gerente o Mesa de Entradas';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_id := public.fn_registrar_obra_social('  ' || v_nombre || '  ');
  if not exists (
    select 1 from public.obra_social
    where id_obra_social = v_id and nombre_obra_social = v_nombre and activo = true
  ) then
    raise exception 'La obra debe guardarse recortada y activa';
  end if;

  select count(*) into v_count from public.fn_listar_obras_sociales()
  where id_obra_social = v_id;
  if v_count <> 1 then raise exception 'La obra activa no aparece en el catálogo que usa Recepción'; end if;

  begin
    perform public.fn_registrar_obra_social(lower(v_nombre));
    raise exception 'Debió rechazar un nombre duplicado que solo cambia mayúsculas';
  exception when unique_violation then
    if sqlerrm <> 'Ya existe una obra social con ese nombre' then raise; end if;
  end;

  begin
    perform public.fn_registrar_obra_social('A');
    raise exception 'Debió rechazar un nombre de un carácter';
  exception when raise_exception then
    if sqlerrm <> 'El nombre debe tener entre 2 y 80 caracteres' then raise; end if;
  end;

  begin
    perform public.fn_registrar_obra_social(repeat('A', 81));
    raise exception 'Debió rechazar un nombre de más de 80 caracteres';
  exception when raise_exception then
    if sqlerrm <> 'El nombre debe tener entre 2 y 80 caracteres' then raise; end if;
  end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_registrar_obra_social(v_nombre || ' mesa');
    raise exception 'Mesa de Entradas no debe registrar obras sociales';
  exception when others then
    if sqlerrm not like 'No tenés permisos para realizar esta acción%' then raise; end if;
  end;

  raise notice 'HU-31 OK';
end;
$$;

rollback;
