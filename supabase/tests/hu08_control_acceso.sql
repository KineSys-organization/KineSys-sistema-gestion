-- Pruebas HU-08 (control de acceso por rol). Todo se revierte al final.
-- Requiere la migración 008_hu08_control_acceso.sql aplicada.
--
-- Simula cada rol con `set local role authenticated` + `request.jwt.claims` (como hace PostgREST).
-- Cuentas: Gerente joseodriozolarieszer@, Mesa carlaperez@, Paciente juanrodriguez@.
-- Profesional: el primero activo (pedroramirez@ no existe en Auth; hoy es luciafernandez@).
--
-- "Bloqueado" = la función corta con un mensaje de permisos.
-- "Pasa el control" = la función puede fallar después por los datos (fecha pasada, id inexistente),
-- pero nunca por permisos. Así se prueban funciones que modifican datos sin armar un caso completo.
begin;

do $$
declare
  v_gerente uuid;
  v_mesa uuid;
  v_prof uuid;
  v_paciente uuid;
  v_sin_fila uuid := gen_random_uuid(); -- cuenta de Auth sin fila en public.usuario
  v_servicio public.servicio;
  v_err text;
  v_n integer;
  -- Mensajes de permisos que usan las fn_* (HU-08 y anteriores).
  c_permiso constant text := '(permiso|Solo el Gerente|Solo un Gerente|No autenticado)';
begin
  select id into v_gerente from auth.users where email = 'joseodriozolarieszer@gmail.com';
  select id into v_mesa from auth.users where email = 'carlaperez@gmail.com';
  select id into v_paciente from auth.users where email = 'juanrodriguez@gmail.com';
  select u.id_usuario into v_prof
  from public.usuario u
  join public.profesional p on p.id_usuario = u.id_usuario
  where u.rol_usuario = 'Profesional' and u.activo = true
  order by u.mail_usuario
  limit 1;

  if v_gerente is null or v_mesa is null or v_paciente is null or v_prof is null then
    raise exception 'Faltan cuentas de prueba (Gerente, Mesa de Entradas, Paciente o Profesional activo)';
  end if;

  -- ============ Gerente: puede todo ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.fn_acceso_gestion();
  select * into v_servicio from public.fn_registrar_servicio('HU08 prueba gerente', 30, 15, 1000);
  perform public.fn_editar_servicio(v_servicio.id_servicio, 'HU08 prueba gerente 2', 45, 15, null);
  perform public.fn_desactivar_servicio(v_servicio.id_servicio);
  select count(*) into v_n from public.fn_listar_servicios();
  select count(*) into v_n from public.fn_listar_profesionales();
  perform public.fn_obtener_profesional(v_prof);
  perform public.fn_consultar_horarios_profesional(v_prof);
  perform public.fn_listar_obras_sociales();
  perform public.fn_buscar_pacientes('a');
  perform public.fn_consultar_agenda_profesional(v_prof, current_date);

  -- Funciones que modifican datos: con datos inválidos, el error tiene que ser de datos, no de permisos.
  begin
    perform public.fn_editar_profesional(gen_random_uuid(), 'X', 'Y', '1990-01-01', 1, '1', 'M', '{}'::uuid[], false);
  exception when others then
    if sqlerrm ~* c_permiso then raise exception 'FALLA: Gerente bloqueado en fn_editar_profesional: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_otorgar_turno(gen_random_uuid(), v_prof, gen_random_uuid(), current_date - 1, '10:00', null);
  exception when others then
    if sqlerrm ~* c_permiso then raise exception 'FALLA: Gerente bloqueado en fn_otorgar_turno: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_registrar_franja_profesional(gen_random_uuid(), 1, '09:00', '10:00');
  exception when others then
    if sqlerrm ~* c_permiso then raise exception 'FALLA: Gerente bloqueado en fn_registrar_franja_profesional: %', sqlerrm; end if;
  end;
  raise notice 'HU-08 Gerente: OK (servicios alta/edición/baja, profesionales, horarios, pacientes, agenda, turnos)';

  -- ============ Mesa de Entradas: recepción sí, configuración no ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mesa, 'role', 'authenticated')::text, true);

  perform public.fn_acceso_gestion();
  select count(*) into v_n from public.fn_listar_servicios(); -- lectura permitida
  perform public.fn_buscar_pacientes('a');
  perform public.fn_listar_obras_sociales();
  perform public.fn_consultar_agenda_profesional(v_prof, current_date);
  begin
    perform public.fn_otorgar_turno(gen_random_uuid(), v_prof, gen_random_uuid(), current_date - 1, '10:00', null);
  exception when others then
    if sqlerrm ~* c_permiso then raise exception 'FALLA: Mesa bloqueada en fn_otorgar_turno: %', sqlerrm; end if;
  end;

  v_err := null;
  begin
    perform public.fn_registrar_servicio('HU08 prueba mesa', 30, 15, null);
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No tenés permisos para realizar esta acción' then
    raise exception 'FALLA: Mesa en fn_registrar_servicio. Esperado bloqueo, obtenido: %', coalesce(v_err, 'OK');
  end if;

  v_err := null;
  begin
    perform public.fn_editar_servicio(v_servicio.id_servicio, 'HU08 mesa', 30, 15, null);
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No tenés permisos para realizar esta acción' then
    raise exception 'FALLA: Mesa en fn_editar_servicio. Obtenido: %', coalesce(v_err, 'OK');
  end if;

  v_err := null;
  begin
    perform public.fn_desactivar_servicio(v_servicio.id_servicio);
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No tenés permisos para realizar esta acción' then
    raise exception 'FALLA: Mesa en fn_desactivar_servicio. Obtenido: %', coalesce(v_err, 'OK');
  end if;

  v_err := null;
  begin
    perform public.fn_editar_profesional(v_prof, 'X', 'Y', '1990-01-01', 1, '1', 'M', '{}'::uuid[], false);
  exception when others then v_err := sqlerrm;
  end;
  if v_err is null or v_err !~* c_permiso then
    raise exception 'FALLA: Mesa en fn_editar_profesional. Obtenido: %', coalesce(v_err, 'OK');
  end if;

  v_err := null;
  begin
    perform public.fn_registrar_franja_profesional(v_prof, 1, '09:00', '10:00');
  exception when others then v_err := sqlerrm;
  end;
  if v_err is null or v_err !~* c_permiso then
    raise exception 'FALLA: Mesa en fn_registrar_franja_profesional. Obtenido: %', coalesce(v_err, 'OK');
  end if;
  raise notice 'HU-08 Mesa de Entradas: OK (pacientes/agenda/turnos sí; servicios y profesionales bloqueados)';

  -- ============ Profesional: sin recepción ni configuración ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof, 'role', 'authenticated')::text, true);

  perform public.fn_acceso_gestion(); -- entra al sistema (solo Inicio)

  v_err := null;
  begin
    perform public.fn_otorgar_turno(gen_random_uuid(), v_prof, gen_random_uuid(), current_date + 1, '10:00', null);
  exception when others then v_err := sqlerrm;
  end;
  if v_err is null or v_err !~* c_permiso then
    raise exception 'FALLA: Profesional en fn_otorgar_turno. Obtenido: %', coalesce(v_err, 'OK');
  end if;

  v_err := null;
  begin
    perform public.fn_buscar_pacientes('a');
  exception when others then v_err := sqlerrm;
  end;
  if v_err is null or v_err !~* c_permiso then
    raise exception 'FALLA: Profesional en fn_buscar_pacientes. Obtenido: %', coalesce(v_err, 'OK');
  end if;

  v_err := null;
  begin
    perform public.fn_registrar_servicio('HU08 prueba prof', 30, 15, null);
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No tenés permisos para realizar esta acción' then
    raise exception 'FALLA: Profesional en fn_registrar_servicio. Obtenido: %', coalesce(v_err, 'OK');
  end if;
  raise notice 'HU-08 Profesional: OK (entra, pero turnos, pacientes y servicios bloqueados)';

  -- ============ Paciente: no entra al sistema de gestión ============
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_paciente, 'role', 'authenticated')::text, true);

  v_err := null;
  begin
    perform public.fn_acceso_gestion();
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No tenés permiso para acceder al sistema de gestión' then
    raise exception 'FALLA: Paciente en fn_acceso_gestion. Obtenido: %', coalesce(v_err, 'OK');
  end if;

  v_err := null;
  begin
    perform public.fn_listar_servicios();
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No tenés permisos para realizar esta acción' then
    raise exception 'FALLA: Paciente en fn_listar_servicios. Obtenido: %', coalesce(v_err, 'OK');
  end if;
  raise notice 'HU-08 Paciente: OK (fn_acceso_gestion lo rechaza)';

  -- ============ Huecos cerrados por la migración 008 ============
  -- Cuenta de Auth sin fila en usuario: antes rol_actual() daba NULL y pasaba el IF.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_sin_fila, 'role', 'authenticated')::text, true);

  v_err := null;
  begin
    perform public.fn_listar_profesionales();
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No tenés permisos para realizar esta acción' then
    raise exception 'FALLA: usuario sin fila en fn_listar_profesionales. Obtenido: %', coalesce(v_err, 'OK');
  end if;

  v_err := null;
  begin
    perform public.fn_listar_servicios();
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No tenés permisos para realizar esta acción' then
    raise exception 'FALLA: usuario sin fila en fn_listar_servicios. Obtenido: %', coalesce(v_err, 'OK');
  end if;

  -- Sin sesión (anon con claims vacíos): tampoco.
  perform set_config('request.jwt.claims', '', true);
  v_err := null;
  begin
    perform public.fn_listar_profesionales();
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No autenticado' then
    raise exception 'FALLA: sin sesión en fn_listar_profesionales. Obtenido: %', coalesce(v_err, 'OK');
  end if;

  -- Gerente desactivado con token todavía vigente: ya no puede modificar servicios.
  reset role;
  update public.usuario set activo = false where id_usuario = v_gerente; -- se revierte con el rollback
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_gerente, 'role', 'authenticated')::text, true);

  v_err := null;
  begin
    perform public.fn_registrar_servicio('HU08 gerente inactivo', 30, 15, null);
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'No tenés permisos para realizar esta acción' then
    raise exception 'FALLA: Gerente inactivo en fn_registrar_servicio. Obtenido: %', coalesce(v_err, 'OK');
  end if;
  raise notice 'HU-08 huecos 008: OK (sin fila en usuario, sin sesión y Gerente inactivo bloqueados)';

  reset role;
  raise notice 'HU-08 OK: Gerente, Mesa de Entradas, Profesional, Paciente y huecos de rol_actual()';
end;
$$;

rollback;
