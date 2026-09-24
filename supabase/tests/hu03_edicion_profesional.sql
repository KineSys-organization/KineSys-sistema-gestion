-- HU-03. Requiere migraciones 001–006 y un Gerente activo.
-- Crea sus propios servicios, profesional, paciente y turnos; revierte todo.
begin;
create function pg_temp.hu03_error(p_sql text, p_mensaje text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_mensaje in sqlerrm) = 0 then raise; end if;
    return;
  end;
  raise exception 'Se esperaba el error % en %', p_mensaje, p_sql;
end;
$$;
do $$
declare
  g uuid;
  p uuid := gen_random_uuid();
  s uuid := gen_random_uuid();
  s2 uuid := gen_random_uuid();
  pa uuid;
  f uuid;
  f2 uuid;
  dni integer;
  dni_pa integer;
  fecha date := (timezone('America/Argentina/Buenos_Aires', now()))::date + 1;
  dia integer;
  r jsonb;
  t1 jsonb;
  t2 jsonb;
  foto jsonb;
  mat text := 'HU03-' || p::text;
begin
  select id_usuario into g from public.usuario where activo and rol_usuario = 'Gerente' limit 1;
  if g is null then raise exception 'Se necesita un Gerente activo'; end if;
  perform set_config('request.jwt.claim.sub', g::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',g)::text, true);
  select n into dni from generate_series(99003000,99003999) n where not exists (select 1 from usuario where dni_usuario = n) limit 1;
  select n into dni_pa from generate_series(99004000,99004999) n where not exists (select 1 from paciente where dni_paciente = n) limit 1;
  dia := extract(isodow from fecha)::integer;
  insert into auth.users(id,email) values(p, p::text || '@hu03.invalid');
  insert into public.usuario(id_usuario,nombre_usuario,apellido_usuario,fecha_nacimiento_usuario,dni_usuario,telefono_usuario,mail_usuario,rol_usuario,activo)
    values(p,'Ana','Prueba','1990-01-01',dni,'1123456789',p::text || '-registro@hu03.invalid', 'Profesional',true);
  insert into public.profesional(id_usuario,matricula,activo) values(p,mat,true);
  insert into public.servicio(id_servicio,nombre_servicio,duracion_minutos,granularidad_minutos,precio_servicio,activo)
    values(s,'HU03 ' || p::text,60,30,100,true),(s2,'HU03 otro ' || p::text,30,30,100,true);
  insert into public.servicio_profesional values(p,s);
  r := public.fn_obtener_profesional(p);
  assert r->>'mail_usuario' = p::text || '@hu03.invalid', 'Debe mostrar el mail de la cuenta seleccionada';
  assert r->'servicios' @> jsonb_build_array(s), 'Debe devolver los servicios guardados';

  r := public.fn_editar_profesional(p,'Ana nueva','Apellido nuevo','1991-02-03',dni,'1199999999',mat,array[s,s2]);
  assert not (r->>'requiere_confirmacion')::boolean;
  r := public.fn_obtener_profesional(p);
  assert r->>'nombre_usuario' = 'Ana nueva';
  assert r->>'telefono_usuario' = '1199999999';
  assert jsonb_array_length(r->'servicios') = 2, 'Al reabrir se conservan las selecciones';
  -- No se quitan asociaciones ni datos hasta aceptar el aviso.
  r := public.fn_editar_profesional(p,'No guardar aún','Apellido','1991-02-03',dni,'1199999999',mat,array[s]);
  assert (r->>'requiere_confirmacion')::boolean;
  assert (public.fn_obtener_profesional(p)->>'nombre_usuario') = 'Ana nueva';
  r := public.fn_editar_profesional(p,'Ana nueva','Apellido nuevo','1991-02-03',dni,'1199999999',mat,array[s],true);
  assert jsonb_array_length(public.fn_obtener_profesional(p)->'servicios') = 1;

  f := public.fn_registrar_franja_profesional(p,dia,'09:00','13:00');
  f2 := public.fn_registrar_franja_profesional(p,dia,'15:00','18:00');
  pa := public.fn_registrar_paciente('Paciente','HU03',dni_pa,'1990-01-01','1123456789','hu03@test.invalid','[]'::jsonb);
  t1 := public.fn_otorgar_turno(pa,p,s,fecha,'11:00',null);
  t2 := public.fn_otorgar_turno(pa,p,s,fecha + 7,'12:00',null);
  select jsonb_agg(to_jsonb(t) order by id_turno) into foto from public.turno t where id_profesional = p;

  assert not public.fn_alternar_estado_profesional(p);
  perform pg_temp.hu03_error(format('select public.fn_consultar_disponibilidad(%L,%L,%L)',p,s,fecha), 'no está activo');
  perform pg_temp.hu03_error(format('select public.fn_otorgar_turno(%L,%L,%L,%L,%L,null)',pa,p,s,fecha,'09:00'), 'no está activo');
  assert (select jsonb_agg(to_jsonb(t) order by id_turno) from public.turno t where id_profesional=p) = foto;
  assert public.fn_alternar_estado_profesional(p);
  assert (public.fn_consultar_disponibilidad(p,s,fecha)->'horarios') ? '09:00';
  assert (select count(*) from public.franja_profesional where id_usuario=p) = 2;
  perform pg_temp.hu03_error(format('select public.fn_editar_profesional(%L,%L,%L,%L,%s,%L,%L,array[]::uuid[],true)',p,'Ana','Prueba','1990-01-01',dni,'1111111111',mat), 'tiene turnos reservados');

  -- Ampliar y conservar límites exactos no afecta turnos.
  r := public.fn_editar_franja_profesional(f,dia,'08:00','13:00',true);
  assert jsonb_array_length(r->'turnos') = 0;
  -- Un turno parcialmente afuera y uno totalmente afuera, en semanas distintas.
  r := public.fn_editar_franja_profesional(f,dia,'09:00','11:30',true);
  assert not (r->>'guardado')::boolean;
  assert jsonb_array_length(r->'turnos') = 2;
  assert (select hora_fin from public.franja_profesional where id_franja=f) = time '13:00';
  r := public.fn_editar_franja_profesional(f,dia,'09:00','11:30');
  assert (r->>'guardado')::boolean, 'Los turnos afectados no bloquean guardar';
  assert jsonb_array_length(r->'turnos') = 2;
  assert (select jsonb_agg(to_jsonb(t) order by id_turno) from public.turno t where id_profesional=p) = foto, 'Ningún dato del turno debe cambiar';
  assert not ((public.fn_consultar_disponibilidad(p,s,fecha)->'horarios') ? '10:30'), 'Disponibilidad respeta nueva franja y ocupación';
  assert (public.fn_consultar_disponibilidad(p,s,fecha)->'horarios') ? '09:00';
  perform pg_temp.hu03_error(format('select public.fn_otorgar_turno(%L,%L,%L,%L,%L,null)',pa,p,s,fecha,'12:00'), 'ya no está disponible');
  perform pg_temp.hu03_error(format('select public.fn_editar_franja_profesional(%L,%s,%L,%L)',f,dia,'12:00','16:00'), 'superpone');
  perform pg_temp.hu03_error(format('select public.fn_editar_franja_profesional(%L,%s,%L,%L)',f,dia,'10:00','09:00'), 'posterior');
  perform pg_temp.hu03_error(format('select public.fn_editar_franja_profesional(%L,%s,%L,%L)',f,dia,'09:00:01','10:00'), 'sin segundos');
  perform pg_temp.hu03_error(format('select public.fn_editar_franja_profesional(%L,8,%L,%L)',f,'09:00','10:00'), 'día de la semana');

  -- Restituir horario, consultar impacto y reservar otro turno antes de guardar.
  perform public.fn_editar_franja_profesional(f,dia,'09:00','13:00');
  r := public.fn_editar_franja_profesional(f,dia,'09:00','10:00',true);
  assert jsonb_array_length(r->'turnos') = 2;
  perform public.fn_otorgar_turno(pa,p,s,fecha,'10:00',null);
  r := public.fn_editar_franja_profesional(f,dia,'09:00','10:00');
  assert jsonb_array_length(r->'turnos') = 3, 'Guardar recalcula turnos nuevos desde la consulta previa';
  perform public.fn_editar_franja_profesional(f,dia,'09:00','13:00');
  -- Cambio de día también reporta los turnos del día original.
  r := public.fn_editar_franja_profesional(f,case when dia=7 then 1 else dia+1 end,'09:00','13:00',true);
  assert jsonb_array_length(r->'turnos') = 3;
  -- Cancelados e históricos quedan excluidos del aviso.
  update public.turno set estado='cancelado' where id_turno=(t2->>'id_turno')::uuid;
  insert into public.turno(id_profesional,id_servicio,id_paciente,fecha,hora_inicio,hora_fin)
    values(p,s,pa,fecha-7,'09:00','10:00');
  select jsonb_agg(to_jsonb(t) order by id_turno) into foto from public.turno t where id_profesional=p;
  r := public.fn_eliminar_franja_profesional(f,true);
  assert jsonb_array_length(r->'turnos') = 2;
  assert exists(select 1 from public.franja_profesional where id_franja=f);
  r := public.fn_eliminar_franja_profesional(f);
  assert (r->>'guardado')::boolean;
  assert jsonb_array_length(r->'turnos') = 2;
  assert not exists(select 1 from public.franja_profesional where id_franja=f);
  assert (select jsonb_agg(to_jsonb(t) order by id_turno) from public.turno t where id_profesional=p) = foto;
  assert not ((public.fn_consultar_disponibilidad(p,s,fecha)->'horarios') ? '09:00');
  assert (public.fn_consultar_disponibilidad(p,s,fecha)->'horarios') ? '15:00';

  -- Permisos reales de RPC; un Profesional no puede invocar estas funciones.
  perform set_config('request.jwt.claim.sub',p::text,true);
  perform pg_temp.hu03_error(format('select public.fn_obtener_profesional(%L)',p), 'Solo el Gerente');
  perform pg_temp.hu03_error(format('select public.fn_alternar_estado_profesional(%L)',p), 'Solo el Gerente');
  perform pg_temp.hu03_error(format('select public.fn_editar_franja_profesional(%L,%s,%L,%L)',f2,dia,'14:00','18:00'), 'Solo el Gerente');
  perform pg_temp.hu03_error(format('select public.fn_eliminar_franja_profesional(%L)',f2), 'Solo el Gerente');
  perform pg_temp.hu03_error(format('select public.fn_editar_profesional(%L,%L,%L,%L,%s,%L,%L,array[]::uuid[],true)',p,'Ana','Prueba','1990-01-01',dni,'1111111111',mat), 'Solo el Gerente');
  perform set_config('request.jwt.claim.sub',g::text,true);
  update public.turno set estado='cancelado' where id_profesional=p;
  r := public.fn_editar_profesional(p,'Ana','Prueba','1990-01-01',dni,'1111111111',mat,array[]::uuid[]);
  assert (r->>'requiere_confirmacion')::boolean;
  assert exists(select 1 from public.servicio_profesional where id_usuario=p);
  r := public.fn_editar_profesional(p,'Ana','Prueba','1990-01-01',dni,'1111111111',mat,array[]::uuid[],true);
  assert not exists(select 1 from public.servicio_profesional where id_usuario=p);
  assert (select count(*) from public.turno where id_profesional=p) = 4, 'Nunca elimina turnos';
  raise notice 'HU03 OK: edición, mail, servicios persistidos, confirmación, estados, disponibilidad, turnos intactos, avisos previos/posteriores, eliminación y permisos';
end;
$$;
rollback;
