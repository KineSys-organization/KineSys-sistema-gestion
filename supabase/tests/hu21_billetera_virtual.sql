-- Pruebas HU-21 (cobro con billetera virtual). Todo se revierte al final.
-- Requiere la migración 028_hu21_billetera_virtual.sql aplicada.
--
-- Cuentas: Mesa carlaperez@ y el primer Profesional activo con servicio.
-- Los turnos se insertan como postgres.
begin;

do $$
declare
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_pac uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_t3 uuid;
  v_res jsonb;
  v_n integer;
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('fn_registrar_pago', 'fn_corregir_pago', 'fn_listar_pagos');
  if v_n <> 3 then
    raise exception 'FALLA: hay % versiones de registrar/corregir/listar pagos (tienen que ser 3)', v_n;
  end if;

  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';

  select p.id_usuario, sp.id_servicio
  into v_prof, v_serv
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario and u.activo = true
    and u.rol_usuario = 'Profesional'
  join public.servicio_profesional sp on sp.id_usuario = p.id_usuario
  join public.servicio s on s.id_servicio = sp.id_servicio and s.activo = true
  where p.activo = true
  order by u.mail_usuario
  limit 1;

  if v_mesa is null or v_prof is null then
    raise exception 'Faltan cuentas de prueba';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_pac := public.fn_registrar_paciente(
    'Ana', 'TestHU21', 99021101, date '1985-03-15', '1100000021', 'ana.hu21.sql@test.com', '[]'::jsonb
  );
  reset role;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy + 30, time '00:05', time '00:10', 'confirmado')
  returning id_turno into v_t1;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy + 30, time '00:10', time '00:15', 'confirmado')
  returning id_turno into v_t2;
  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy + 30, time '00:15', time '00:20', 'confirmado')
  returning id_turno into v_t3;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ---------- Falta el nº / formato inválido ----------
  begin
    perform public.fn_registrar_pago(v_t1, 1000, 0, 'billetera', null);
    raise exception 'FALLA: registró billetera sin nº';
  exception when others then
    if sqlerrm <> 'Ingresá un número de operación válido' then raise; end if;
  end;
  begin
    perform public.fn_registrar_pago(v_t1, 1000, 0, 'billetera', 'AB 12');
    raise exception 'FALLA: aceptó un nº con espacios';
  exception when others then
    if sqlerrm <> 'Ingresá un número de operación válido' then raise; end if;
  end;
  begin
    perform public.fn_registrar_pago(v_t1, 1000, 0, 'billetera', 'A12');
    raise exception 'FALLA: aceptó un nº de 3 caracteres';
  exception when others then
    if sqlerrm <> 'Ingresá un número de operación válido' then raise; end if;
  end;

  -- ---------- Registro con billetera ----------
  v_res := public.fn_registrar_pago(v_t1, 1000, 0, 'billetera', '  MP123456789  ');
  if v_res -> 'pago' ->> 'medio_pago' <> 'billetera'
    or v_res -> 'pago' ->> 'numero_operacion' <> 'MP123456789'
    or (v_res -> 'pago' ->> 'importe_final')::numeric <> 1000 then
    raise exception 'FALLA: el pago con billetera quedó mal: %', v_res -> 'pago';
  end if;

  -- ---------- Nº repetido (sin distinguir mayúsculas) ----------
  begin
    perform public.fn_registrar_pago(v_t2, 1000, 0, 'billetera', 'mp123456789');
    raise exception 'FALLA: aceptó un nº repetido';
  exception when others then
    if sqlerrm <> 'Ese número de operación ya está registrado en otro pago' then raise; end if;
  end;

  -- ---------- Con otro medio el nº no se guarda ----------
  v_res := public.fn_registrar_pago(v_t2, 1000, 0, 'efectivo', 'IGNORADO1');
  if v_res -> 'pago' -> 'numero_operacion' <> 'null'::jsonb then
    raise exception 'FALLA: guardó un nº con efectivo';
  end if;

  -- ---------- Corrección hacia billetera ----------
  begin
    perform public.fn_corregir_pago(v_t2, 1000, 0, 'billetera', 'Pagó con MP', null);
    raise exception 'FALLA: corrigió a billetera sin nº';
  exception when others then
    if sqlerrm <> 'Ingresá un número de operación válido' then raise; end if;
  end;
  begin
    perform public.fn_corregir_pago(v_t2, 1000, 0, 'billetera', 'Pagó con MP', 'MP123456789');
    raise exception 'FALLA: corrigió con un nº de otro pago';
  exception when others then
    if sqlerrm <> 'Ese número de operación ya está registrado en otro pago' then raise; end if;
  end;
  v_res := public.fn_corregir_pago(v_t2, 1000, 0, 'billetera', 'Pagó con MP', 'MODO0001');
  if v_res -> 'pago' ->> 'numero_operacion' <> 'MODO0001'
    or v_res -> 'correcciones' -> 0 -> 'numero_operacion_anterior' <> 'null'::jsonb
    or v_res -> 'correcciones' -> 0 ->> 'numero_operacion_nuevo' <> 'MODO0001' then
    raise exception 'FALLA: corrección hacia billetera quedó mal: %', v_res;
  end if;

  -- El mismo pago puede conservar su nº (no choca consigo mismo) y cambiar otra cosa.
  v_res := public.fn_corregir_pago(v_t2, 1200, 0, 'billetera', 'Importe', 'MODO0001');
  if (v_res -> 'pago' ->> 'importe_final')::numeric <> 1200 then
    raise exception 'FALLA: no se pudo corregir conservando el nº';
  end if;

  -- ---------- Corrección desde billetera: el nº se quita, el historial lo guarda ----------
  v_res := public.fn_corregir_pago(v_t2, 1200, 0, 'transferencia', 'Era transferencia', 'MODO0001');
  if v_res -> 'pago' -> 'numero_operacion' <> 'null'::jsonb
    or v_res -> 'correcciones' -> 0 ->> 'numero_operacion_anterior' <> 'MODO0001'
    or v_res -> 'correcciones' -> 0 -> 'numero_operacion_nuevo' <> 'null'::jsonb then
    raise exception 'FALLA: corrección desde billetera quedó mal: %', v_res;
  end if;

  -- Ahora el nº MODO0001 quedó libre.
  v_res := public.fn_registrar_pago(v_t3, 900, 0, 'billetera', 'MODO0001');
  if v_res -> 'pago' ->> 'numero_operacion' <> 'MODO0001' then
    raise exception 'FALLA: no se pudo reusar un nº que se quitó';
  end if;

  -- ---------- Listado: nº de operación y filtro por medio ----------
  v_res := public.fn_listar_pagos('TestHU21', null, null, 1, null, 'billetera');
  if (v_res ->> 'total')::int <> 2
    or not exists (
      select 1 from jsonb_array_elements(v_res -> 'pagos') e
      where e ->> 'numero_operacion' = 'MP123456789'
    ) then
    raise exception 'FALLA: el filtro Billetera no anduvo: %', v_res;
  end if;
  begin
    perform public.fn_listar_pagos(null, null, null, 1, null, 'bitcoin');
    raise exception 'FALLA: aceptó un medio inválido en el listado';
  exception when others then
    if sqlerrm <> 'El medio de pago no es válido' then raise; end if;
  end;

  -- ---------- Reembolso de un pago con billetera (HU-22) ----------
  v_res := public.fn_registrar_reembolso(v_t1, 'pedido_paciente', null, null);
  if v_res -> 'reembolso' ->> 'medio_devolucion' <> 'billetera' then
    raise exception 'FALLA: el reembolso de un pago con billetera quedó mal';
  end if;

  -- ============ Profesional: bloqueado ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);
  begin
    perform public.fn_registrar_pago(v_t1, 1000, 0, 'billetera', 'PROF1234');
    raise exception 'FALLA: el profesional registró un pago';
  exception when others then
    if sqlerrm <> 'No tenés permisos para realizar esta acción' then raise; end if;
  end;

  reset role;

  -- ============ Checks de la tabla (última defensa) ============
  begin
    update public.pago set numero_operacion = null where id_turno = v_t3;
    raise exception 'FALLA: la tabla aceptó billetera sin nº';
  exception when check_violation then null;
  end;
  begin
    update public.pago set numero_operacion = 'XX1234' where id_turno = v_t2;
    raise exception 'FALLA: la tabla aceptó nº con transferencia';
  exception when check_violation then null;
  end;

  raise notice 'HU-21: todas las pruebas pasaron';
end;
$$;

rollback;
