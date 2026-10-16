-- Pruebas de la corrección HU-21 / HU-22: reembolsar un pago con billetera virtual
-- por el mismo medio. Todo se revierte al final.
-- Requiere la migración 20261016120000_hu21_reembolso_medio_billetera.sql aplicada.
--
-- Cuentas: Mesa carlaperez@ y el primer Profesional activo con servicio.
-- El turno se inserta como postgres.
begin;

do $$
declare
  v_mesa uuid;
  v_prof uuid;
  v_serv uuid;
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_pac uuid;
  v_turno uuid;
  v_id_pago uuid;
  v_res jsonb;
  v_checks text[];
begin
  -- ---------- Un solo check sobre medio_devolucion, y admite billetera ----------
  select array_agg(c.conname::text order by c.conname)
  into v_checks
  from pg_constraint c
  where c.conrelid = 'public.reembolso'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%medio_devolucion%';

  if v_checks is distinct from array['reembolso_medio_valido'] then
    raise exception 'FALLA: los checks de medio_devolucion son % (tiene que quedar solo reembolso_medio_valido)', v_checks;
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.reembolso'::regclass
      and c.conname = 'reembolso_medio_valido'
      and pg_get_constraintdef(c.oid) like '%billetera%'
  ) then
    raise exception 'FALLA: reembolso_medio_valido no admite billetera';
  end if;

  -- ---------- Datos: paciente, turno y pago con billetera ----------
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
    'Ana', 'TestReembBill', 99021201, date '1985-03-15', '1100000212', 'ana.reembbill.sql@test.com', '[]'::jsonb
  );
  reset role;

  insert into public.turno (id_profesional, id_servicio, id_paciente, fecha, hora_inicio, hora_fin, estado)
  values (v_prof, v_serv, v_pac, v_hoy + 30, time '00:25', time '00:30', 'confirmado')
  returning id_turno into v_turno;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_res := public.fn_registrar_pago(v_turno, 1500, 0, 'billetera', 'RBTEST0001');
  v_id_pago := (v_res -> 'pago' ->> 'id_pago')::uuid;

  -- ---------- Reembolso por billetera, con el medio explícito ----------
  v_res := public.fn_registrar_reembolso(v_turno, 'turno_cancelado', null, 'billetera');
  if v_res -> 'reembolso' ->> 'medio_devolucion' <> 'billetera'
    or v_res -> 'pago' ->> 'estado' <> 'Reembolsado' then
    raise exception 'FALLA: el reembolso por billetera quedó mal: %', v_res;
  end if;

  reset role;

  -- ---------- El check que queda sigue rechazando medios inválidos ----------
  begin
    update public.reembolso set medio_devolucion = 'bitcoin' where id_pago = v_id_pago;
    raise exception 'FALLA: la tabla aceptó un medio de devolución inválido';
  exception when check_violation then null;
  end;

  raise notice 'HU-21 reembolso con billetera: todas las pruebas pasaron';
end;
$$;

rollback;
