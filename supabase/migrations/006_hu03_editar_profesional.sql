-- HU-03. Edición de datos del profesional, activación/desactivación y modificación/eliminación de franjas horarias.
-- Requiere HU-02A, HU-02B y las migraciones 003 a 005 (HU-04/05/06).
begin;

-- 1. Alternar estado activo/inactivo del profesional
create or replace function public.fn_alternar_estado_profesional(p_id_usuario uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nuevo_estado boolean;
begin
  if not exists (
    select 1 from public.usuario
    where id_usuario = auth.uid() and activo and rol_usuario = 'Gerente'
  ) then
    raise exception 'Solo el Gerente puede cambiar el estado del profesional';
  end if;

  if not exists (select 1 from public.profesional where id_usuario = p_id_usuario) then
    raise exception 'El profesional no existe';
  end if;

  select not activo into v_nuevo_estado from public.profesional where id_usuario = p_id_usuario for update;
  update public.profesional set activo = v_nuevo_estado where id_usuario = p_id_usuario;
  update public.usuario set activo = v_nuevo_estado where id_usuario = p_id_usuario;

  return v_nuevo_estado;
end;
$$;

-- 2. Consultar datos de un profesional para edición
-- Puede existir una versión anterior RETURNS TABLE/record. PostgreSQL no permite
-- cambiar ese retorno con CREATE OR REPLACE; se recrea solo esta RPC, sin CASCADE.
-- Sus permisos se restituyen más abajo, dentro de la misma transacción.
drop function if exists public.fn_obtener_profesional(uuid);
create or replace function public.fn_obtener_profesional(p_id_usuario uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if not exists (
    select 1 from public.usuario
    where id_usuario = auth.uid() and activo and rol_usuario = 'Gerente'
  ) then
    raise exception 'Solo el Gerente puede consultar los datos del profesional';
  end if;

  select jsonb_build_object(
    'id_usuario', u.id_usuario,
    'nombre_usuario', u.nombre_usuario,
    'apellido_usuario', u.apellido_usuario,
    'fecha_nacimiento_usuario', u.fecha_nacimiento_usuario,
    'dni_usuario', u.dni_usuario,
    'telefono_usuario', u.telefono_usuario,
    'mail_usuario', coalesce(nullif(cuenta.email, ''), u.mail_usuario),
    'matricula', p.matricula,
    'activo', p.activo,
    'servicios', coalesce((
      select jsonb_agg(sp.id_servicio)
      from public.servicio_profesional sp
      where sp.id_usuario = p.id_usuario
    ), '[]'::jsonb)
  ) into v_resultado
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario
  left join auth.users cuenta on cuenta.id = p.id_usuario
  where p.id_usuario = p_id_usuario;

  if v_resultado is null then
    raise exception 'El profesional no existe';
  end if;

  return v_resultado;
end;
$$;

-- 3. Editar datos personales, matrícula y servicios de un profesional
drop function if exists public.fn_editar_profesional(uuid, text, text, date, integer, text, text, uuid[]);
create or replace function public.fn_editar_profesional(
  p_id_usuario uuid,
  p_nombre text,
  p_apellido text,
  p_fecha_nacimiento date,
  p_dni integer,
  p_telefono text,
  p_matricula text,
  p_servicios uuid[],
  p_confirmar_servicios boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.usuario
    where id_usuario = auth.uid() and activo and rol_usuario = 'Gerente'
  ) then
    raise exception 'Solo el Gerente puede editar datos de profesionales';
  end if;

  perform 1 from public.profesional where id_usuario = p_id_usuario for update;
  if not found then
    raise exception 'El profesional no existe';
  end if;

  if p_nombre is null or trim(p_nombre) = ''
    or p_apellido is null or trim(p_apellido) = ''
    or p_telefono is null or trim(p_telefono) = ''
    or p_matricula is null or trim(p_matricula) = '' then
    raise exception 'Faltan campos obligatorios';
  end if;

  if p_fecha_nacimiento is null then
    raise exception 'La fecha de nacimiento es obligatoria';
  end if;

  if p_dni is null or p_dni <= 0 then
    raise exception 'El DNI debe ser un número entero mayor a cero';
  end if;

  if p_servicios is null then
    raise exception 'La lista de servicios es obligatoria';
  end if;
  if exists (
    select 1 from unnest(p_servicios) elegido
    where elegido is null or not exists (
      select 1 from public.servicio s where s.id_servicio = elegido
        and (s.activo or exists (select 1 from public.servicio_profesional sp
          where sp.id_usuario = p_id_usuario and sp.id_servicio = elegido))
    )
  ) then
    raise exception 'Seleccioná servicios existentes y activos';
  end if;

  if exists (select 1 from public.servicio_profesional
    where id_usuario = p_id_usuario and not (id_servicio = any(p_servicios))) then
    if exists (select 1 from public.turno t where t.id_profesional = p_id_usuario
      and t.estado = 'confirmado'
      and t.fecha + t.hora_fin > timezone('America/Argentina/Buenos_Aires', now())) then
      raise exception 'No se pueden quitar servicios: el profesional tiene turnos reservados';
    end if;
    if p_confirmar_servicios is distinct from true then
      return jsonb_build_object('requiere_confirmacion', true, 'mensaje',
        case when cardinality(p_servicios) = 0
          then 'El profesional quedará sin servicios asociados y no podrá recibir turnos nuevos. ¿Confirmás el cambio?'
          else 'Se quitarán los servicios desmarcados del profesional. ¿Confirmás el cambio?' end);
    end if;
  elsif cardinality(p_servicios) = 0 and p_confirmar_servicios is distinct from true then
    return jsonb_build_object('requiere_confirmacion', true, 'mensaje',
      'El profesional seguirá sin servicios asociados y no podrá recibir turnos nuevos. ¿Confirmás el cambio?');
  end if;

  -- Validar DNI único excluyendo al propio usuario
  if exists (
    select 1 from public.usuario
    where dni_usuario = p_dni and id_usuario <> p_id_usuario
  ) then
    raise exception 'El DNI ya está registrado por otro usuario';
  end if;

  -- Validar matrícula única excluyendo al propio profesional
  if exists (
    select 1 from public.profesional
    where matricula = trim(p_matricula) and id_usuario <> p_id_usuario
  ) then
    raise exception 'La matrícula ya está registrada por otro profesional';
  end if;

  -- Actualizar usuario
  update public.usuario
  set nombre_usuario = trim(p_nombre),
      apellido_usuario = trim(p_apellido),
      fecha_nacimiento_usuario = p_fecha_nacimiento,
      dni_usuario = p_dni,
      telefono_usuario = trim(p_telefono)
  where id_usuario = p_id_usuario;

  -- Actualizar matrícula del profesional
  update public.profesional
  set matricula = trim(p_matricula)
  where id_usuario = p_id_usuario;

  -- Sincronizar servicios: eliminar los no seleccionados
  delete from public.servicio_profesional
  where id_usuario = p_id_usuario
    and id_servicio <> all(p_servicios);

  -- Agregar nuevos seleccionados
  insert into public.servicio_profesional (id_usuario, id_servicio)
  select distinct p_id_usuario, s_id
  from unnest(p_servicios) as s_id
  where not exists (
    select 1 from public.servicio_profesional sp
    where sp.id_usuario = p_id_usuario and sp.id_servicio = s_id
  );
  return jsonb_build_object('requiere_confirmacion', false);
end;
$$;

-- Turnos que estaban cubiertos por la franja y quedarían fuera de la nueva agenda.
-- Solo lectura: nunca se actualiza ni cancela un turno de HU-06.
create or replace function public.fn_hu03_turnos_fuera_de_franja(
  p_id_franja uuid, p_dia integer, p_inicio time, p_fin time
) returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id_turno', t.id_turno, 'fecha', t.fecha,
    'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
    'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
    'paciente', concat_ws(', ', pa.apellido_paciente, pa.nombre_paciente),
    'dni_paciente', pa.dni_paciente, 'servicio', s.nombre_servicio,
    'estado', t.estado
  ) order by t.fecha, t.hora_inicio), '[]'::jsonb)
  from public.turno t
  join public.franja_profesional actual on actual.id_franja = p_id_franja
    and t.id_profesional = actual.id_usuario
  left join public.paciente pa on pa.id_paciente = t.id_paciente
  join public.servicio s on s.id_servicio = t.id_servicio
  where t.estado = 'confirmado'
    and t.fecha + t.hora_fin > timezone('America/Argentina/Buenos_Aires', now())
    and extract(isodow from t.fecha) = actual.dia_semana
    and t.hora_inicio >= actual.hora_inicio and t.hora_fin <= actual.hora_fin
    and not exists (
      select 1 from public.franja_profesional otra
      where otra.id_usuario = actual.id_usuario and otra.id_franja <> actual.id_franja
        and otra.dia_semana = extract(isodow from t.fecha)
        and t.hora_inicio >= otra.hora_inicio and t.hora_fin <= otra.hora_fin
    )
    and not coalesce(p_dia = extract(isodow from t.fecha)
      and t.hora_inicio >= p_inicio and t.hora_fin <= p_fin, false);
$$;
revoke all on function public.fn_hu03_turnos_fuera_de_franja(uuid, integer, time, time)
  from public, anon, authenticated;

-- Consultar primero permite anticipar el impacto. Guardar recalcula el listado
-- dentro de la misma transacción del cambio, sin bloquearlo por tener turnos.
drop function if exists public.fn_editar_franja_profesional(uuid, integer, time, time);
create or replace function public.fn_editar_franja_profesional(
  p_id_franja uuid, p_dia_semana integer, p_hora_inicio time, p_hora_fin time,
  p_solo_consultar boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id_usuario uuid;
  v_afectados jsonb;
begin
  if not exists (select 1 from public.usuario
    where id_usuario = auth.uid() and activo and rol_usuario = 'Gerente') then
    raise exception 'Solo el Gerente puede modificar franjas horarias';
  end if;
  select id_usuario into v_id_usuario from public.franja_profesional where id_franja = p_id_franja;
  if v_id_usuario is null then raise exception 'La franja horaria no existe'; end if;
  perform 1 from public.profesional where id_usuario = v_id_usuario for update;
  perform 1 from public.franja_profesional where id_franja = p_id_franja for update;
  if not found then raise exception 'La franja horaria no existe'; end if;
  if not exists (select 1 from public.servicio_profesional where id_usuario = v_id_usuario) then
    raise exception 'El profesional debe tener al menos un servicio asociado';
  end if;
  if p_dia_semana is null or p_dia_semana not between 1 and 7 then
    raise exception 'Seleccioná un día de la semana válido';
  end if;
  if p_hora_inicio is null or p_hora_fin is null or p_hora_fin <= p_hora_inicio then
    raise exception 'La hora de fin debe ser posterior a la hora de inicio';
  end if;
  if p_hora_fin >= time '24:00'
    or extract(second from p_hora_inicio) <> 0 or extract(second from p_hora_fin) <> 0 then
    raise exception 'Ingresá horarios entre 00:00 y 23:59, sin segundos';
  end if;
  if exists (select 1 from public.franja_profesional f
    where f.id_usuario = v_id_usuario and f.id_franja <> p_id_franja
      and f.dia_semana = p_dia_semana
      and f.hora_inicio < p_hora_fin and f.hora_fin > p_hora_inicio) then
    raise exception 'La franja se superpone con otro horario del mismo día';
  end if;

  v_afectados := public.fn_hu03_turnos_fuera_de_franja(p_id_franja, p_dia_semana, p_hora_inicio, p_hora_fin);
  if p_solo_consultar is distinct from true then
    update public.franja_profesional
      set dia_semana = p_dia_semana, hora_inicio = p_hora_inicio, hora_fin = p_hora_fin
      where id_franja = p_id_franja;
  end if;
  return jsonb_build_object('guardado', p_solo_consultar is distinct from true, 'turnos', v_afectados);
exception when exclusion_violation then
  raise exception 'La franja se superpone con otro horario del mismo día';
end;
$$;

drop function if exists public.fn_eliminar_franja_profesional(uuid);
create or replace function public.fn_eliminar_franja_profesional(
  p_id_franja uuid, p_solo_consultar boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id_usuario uuid;
  v_afectados jsonb;
begin
  if not exists (select 1 from public.usuario
    where id_usuario = auth.uid() and activo and rol_usuario = 'Gerente') then
    raise exception 'Solo el Gerente puede eliminar franjas horarias';
  end if;
  select id_usuario into v_id_usuario from public.franja_profesional where id_franja = p_id_franja;
  if v_id_usuario is null then raise exception 'La franja horaria no existe'; end if;
  perform 1 from public.profesional where id_usuario = v_id_usuario for update;
  perform 1 from public.franja_profesional where id_franja = p_id_franja for update;
  if not found then raise exception 'La franja horaria no existe'; end if;
  v_afectados := public.fn_hu03_turnos_fuera_de_franja(p_id_franja, null, null, null);
  if p_solo_consultar is distinct from true then
    delete from public.franja_profesional where id_franja = p_id_franja;
  end if;
  return jsonb_build_object('guardado', p_solo_consultar is distinct from true, 'turnos', v_afectados);
end;
$$;

revoke all on function public.fn_alternar_estado_profesional(uuid) from public, anon;
revoke all on function public.fn_obtener_profesional(uuid) from public, anon;
revoke all on function public.fn_editar_profesional(uuid, text, text, date, integer, text, text, uuid[], boolean) from public, anon;
revoke all on function public.fn_editar_franja_profesional(uuid, integer, time, time, boolean) from public, anon;
revoke all on function public.fn_eliminar_franja_profesional(uuid, boolean) from public, anon;
grant execute on function public.fn_alternar_estado_profesional(uuid) to authenticated;
grant execute on function public.fn_obtener_profesional(uuid) to authenticated;
grant execute on function public.fn_editar_profesional(uuid, text, text, date, integer, text, text, uuid[], boolean) to authenticated;
grant execute on function public.fn_editar_franja_profesional(uuid, integer, time, time, boolean) to authenticated;
grant execute on function public.fn_eliminar_franja_profesional(uuid, boolean) to authenticated;

create or replace function public.fn_otorgar_turno(
  p_id_paciente uuid,
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_hora time,
  p_id_obra_social uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ahora timestamp;
  v_afiliado text;
  v_disp jsonb;
  v_duracion integer;
  v_id uuid;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para otorgar turnos';
  end if;

  if p_id_paciente is null
    or p_id_profesional is null
    or p_id_servicio is null
    or p_fecha is null
    or p_hora is null then
    raise exception 'Faltan campos';
  end if;

  -- Evita confirmar con una agenda anterior a un cambio concurrente de HU-03.
  perform 1 from public.profesional where id_usuario = p_id_profesional for update;

  -- No se otorgan turnos en el pasado (hora local de Argentina, igual que HU-05).
  v_ahora := timezone('America/Argentina/Buenos_Aires', now());
  if p_fecha + p_hora < v_ahora then
    raise exception 'No se pueden otorgar turnos con fecha anterior a la actual';
  end if;

  if not exists (
    select 1 from public.paciente
    where id_paciente = p_id_paciente and activo = true
  ) then
    raise exception 'El paciente no existe o no está activo';
  end if;

  -- La cobertura tiene que ser una obra social del paciente (o null = Particular).
  if p_id_obra_social is not null then
    select pos.numero_afiliado into v_afiliado
    from public.paciente_obra_social pos
    where pos.id_paciente = p_id_paciente
      and pos.id_obra_social = p_id_obra_social;

    if v_afiliado is null then
      raise exception 'La obra social elegida no corresponde al paciente';
    end if;
  end if;

  -- Dos confirmaciones del mismo profesional y día se atienden de a una:
  -- la segunda espera acá y después ya ve el turno de la primera.
  perform pg_advisory_xact_lock(
    hashtextextended(p_id_profesional::text || p_fecha::text, 0)
  );

  -- Revalidación al confirmar: reutiliza HU-05 (profesional activo, servicio asociado,
  -- franja, granularidad, 30 días y ocupación). Si la hora no figura, ya no está libre.
  v_disp := public.fn_consultar_disponibilidad(p_id_profesional, p_id_servicio, p_fecha);

  if not ((v_disp -> 'horarios') ? to_char(p_hora, 'HH24:MI')) then
    raise exception 'El horario seleccionado ya no está disponible';
  end if;

  v_duracion := (v_disp ->> 'duracion_minutos')::integer;

  begin
    insert into public.turno (
      id_profesional,
      id_servicio,
      id_paciente,
      fecha,
      hora_inicio,
      hora_fin,
      estado,
      id_obra_social,
      numero_afiliado
    )
    values (
      p_id_profesional,
      p_id_servicio,
      p_id_paciente,
      p_fecha,
      p_hora,
      p_hora + make_interval(mins => v_duracion),
      'confirmado',
      p_id_obra_social,
      v_afiliado
    )
    returning id_turno into v_id;
  exception when exclusion_violation then
    -- Última defensa: la restricción EXCLUDE detectó un solapamiento.
    raise exception 'El horario seleccionado ya no está disponible';
  end;

  return public.fn_obtener_turno(v_id);
end;
$$;


notify pgrst, 'reload schema';
commit;
