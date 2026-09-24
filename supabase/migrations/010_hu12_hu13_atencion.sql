-- HU-12. Consultar mi agenda y mis pacientes del día (Profesional).
-- HU-13. Registrar la atención de un turno (Profesional).
--
-- Quién es el profesional: en este modelo turno.id_profesional = profesional.id_usuario
-- = usuario.id_usuario = auth.uid(). Por eso la base lo identifica con auth.uid() y
-- NUNCA con un id que mande el front: un Profesional que pide la agenda o un turno
-- de otro profesional recibe un error, aunque cambie ids en la URL o en el request.
--
-- La tabla turno ya tiene RLS habilitado y sin grants a authenticated (HU-05), igual que
-- la nueva tabla atencion: el único acceso es por estas fn_* security definer.
--
-- Cambios sobre funciones existentes (create or replace, misma firma):
--   * fn_consultar_agenda_profesional (HU-07/HU-10A): Recepción igual que antes; el Profesional
--     solo su propia agenda. Suma los turnos 'atendido' y el dato 'atendible'.
--   * fn_obtener_turno (HU-06/HU-10A): Recepción igual que antes; el Profesional solo sus turnos.
--     Suma datos del paciente para atenderlo, 'atendible' y la atención (solo a su profesional).
--   * fn_consultar_disponibilidad (HU-05/HU-06): un turno 'atendido' sigue ocupando su horario.
--   * fn_cancelar_turno (HU-10A): un turno 'atendido' no se puede cancelar.
begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

-- ============ Estado 'atendido' ============
alter table public.turno drop constraint if exists turno_estado_valido;
alter table public.turno
  add constraint turno_estado_valido
    check (estado in ('confirmado', 'cancelado', 'ausente', 'atendido'));

-- Un turno atendido ocupó su horario: la restricción de superposición lo sigue contando.
-- (Hasta esta migración no hay turnos 'atendido', así que recrearla no puede fallar.)
alter table public.turno drop constraint if exists turno_sin_superposicion;
alter table public.turno
  add constraint turno_sin_superposicion exclude using gist (
    id_profesional with =,
    tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') with &&
  ) where (estado in ('confirmado', 'atendido'));

-- ============ Tabla atencion (HU-13) ============
-- Una atención por turno (unique): es la última defensa contra el doble registro.
-- Paciente y profesional se copian del turno al registrar (no los elige el front).
-- Queda lista para el historial del paciente (HU-16).
create table public.atencion (
  id_atencion uuid primary key default gen_random_uuid(),
  id_turno uuid not null references public.turno (id_turno),
  id_profesional uuid not null references public.profesional (id_usuario),
  id_paciente uuid not null references public.paciente (id_paciente),
  fecha_atencion date not null,
  observaciones text not null,
  motivo_consulta text, -- Should del PDF maestro: opcional
  registrado_en timestamptz not null default now(),
  editado_en timestamptz, -- null = nunca se editó
  constraint atencion_un_registro_por_turno unique (id_turno),
  constraint atencion_observaciones_validas
    check (char_length(trim(observaciones)) between 1 and 2000),
  constraint atencion_motivo_largo
    check (motivo_consulta is null or char_length(motivo_consulta) <= 200)
);

create index idx_atencion_paciente on public.atencion (id_paciente, fecha_atencion);
create index idx_atencion_profesional on public.atencion (id_profesional, fecha_atencion);

alter table public.atencion enable row level security;
revoke all on public.atencion from public, anon, authenticated;

-- ============ Helper interno: ¿el turno es del profesional logueado? ============
-- Exige un Profesional activo (HU-08) y que el turno sea suyo.
-- Mismo mensaje si no existe o si es de otro: no se revela qué ids existen.
create or replace function public.fn_exigir_turno_propio(p_id_turno uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_exigir_rol(array['Profesional']);

  if p_id_turno is null or not exists (
    select 1
    from public.turno t
    where t.id_turno = p_id_turno
      and t.id_profesional = auth.uid()
  ) then
    raise exception 'El turno no existe o no pertenece a tu agenda';
  end if;
end;
$$;

revoke all on function public.fn_exigir_turno_propio(uuid) from public, anon, authenticated;

-- ============ HU-06/HU-10A/HU-12: detalle de un turno ============
create or replace function public.fn_obtener_turno(p_id_turno uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_ahora timestamp := timezone('America/Argentina/Buenos_Aires', now());
  v_es_recepcion boolean := public.fn_es_recepcion();
begin
  -- Recepción ve cualquier turno. Si no, tiene que ser el Profesional dueño del turno (HU-12).
  if not v_es_recepcion then
    perform public.fn_exigir_turno_propio(p_id_turno);
  end if;

  select jsonb_build_object(
    'id_turno', t.id_turno,
    'estado', t.estado,
    'fecha', t.fecha,
    'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
    'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
    'id_paciente', pa.id_paciente,
    'nombre_paciente', pa.nombre_paciente,
    'apellido_paciente', pa.apellido_paciente,
    'dni_paciente', pa.dni_paciente,
    -- HU-12: lo necesario para atender al paciente.
    'fecha_nacimiento_paciente', pa.fecha_nacimiento_paciente,
    'telefono_paciente', pa.telefono_paciente,
    'id_profesional', t.id_profesional,
    'nombre_profesional', u.nombre_usuario,
    'apellido_profesional', u.apellido_usuario,
    'id_servicio', t.id_servicio,
    'nombre_servicio', s.nombre_servicio,
    'id_obra_social', t.id_obra_social,
    'cobertura', coalesce(o.nombre_obra_social, 'Particular'),
    'numero_afiliado', t.numero_afiliado,
    'motivo_cancelacion', t.motivo_cancelacion,
    'detalle_cancelacion', t.detalle_cancelacion,
    'cancelado_en', t.cancelado_en,
    'cancelable', (t.estado = 'confirmado' and t.fecha + t.hora_inicio > v_ahora),
    -- HU-13: confirmado y del día (hora de Argentina).
    'atendible', (t.estado = 'confirmado' and t.fecha = v_ahora::date),
    -- HU-13: la atención (observaciones clínicas) solo la ve el profesional que atendió.
    'atencion', case
      when a.id_atencion is not null and a.id_profesional = auth.uid() then
        jsonb_build_object(
          'fecha_atencion', a.fecha_atencion,
          'observaciones', a.observaciones,
          'motivo_consulta', a.motivo_consulta,
          'registrado_en', a.registrado_en,
          'editado_en', a.editado_en
        )
      else null
    end
  )
  into v_resultado
  from public.turno t
  join public.paciente pa on pa.id_paciente = t.id_paciente
  join public.usuario u on u.id_usuario = t.id_profesional
  join public.servicio s on s.id_servicio = t.id_servicio
  left join public.obra_social o on o.id_obra_social = t.id_obra_social
  left join public.atencion a on a.id_turno = t.id_turno
  where t.id_turno = p_id_turno;

  if v_resultado is null then
    raise exception 'El turno no existe';
  end if;

  return v_resultado;
end;
$$;

-- ============ HU-07/HU-10A/HU-12: agenda de un profesional para una fecha ============
create or replace function public.fn_consultar_agenda_profesional(
  p_id_profesional uuid,
  p_fecha date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
begin
  -- Recepción consulta la agenda de cualquier profesional (HU-07).
  -- Un Profesional solo la suya (HU-12): el id tiene que ser el de su sesión.
  if not public.fn_es_recepcion() then
    perform public.fn_exigir_rol(array['Profesional']);

    if p_id_profesional is distinct from auth.uid() then
      raise exception 'Solo podés consultar tu propia agenda';
    end if;
  end if;

  if p_id_profesional is null or p_fecha is null then
    raise exception 'Faltan campos';
  end if;

  if not exists (
    select 1
    from public.profesional p
    join public.usuario u on u.id_usuario = p.id_usuario
    where p.id_usuario = p_id_profesional
      and p.activo = true
      and u.activo = true
      and u.rol_usuario = 'Profesional'
  ) then
    raise exception 'El profesional no existe o no está activo';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id_turno', t.id_turno,
          'estado', t.estado,
          'fecha', t.fecha,
          'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
          'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
          'id_paciente', pa.id_paciente,
          'nombre_paciente', pa.nombre_paciente,
          'apellido_paciente', pa.apellido_paciente,
          'dni_paciente', pa.dni_paciente,
          'id_profesional', t.id_profesional,
          'id_servicio', t.id_servicio,
          'nombre_servicio', s.nombre_servicio,
          'motivo_cancelacion', t.motivo_cancelacion,
          'atendible', (t.estado = 'confirmado' and t.fecha = v_hoy)
        )
        order by t.hora_inicio, (t.estado = 'cancelado'), t.creado
      )
      from public.turno t
      join public.paciente pa on pa.id_paciente = t.id_paciente
      join public.servicio s on s.id_servicio = t.id_servicio
      where t.id_profesional = p_id_profesional
        and t.fecha = p_fecha
        and t.estado in ('confirmado', 'cancelado', 'atendido')
    ),
    '[]'::jsonb
  );
end;
$$;

-- ============ HU-13: registrar la atención ============
create or replace function public.fn_registrar_atencion(
  p_id_turno uuid,
  p_observaciones text,
  p_motivo_consulta text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observaciones text := nullif(trim(p_observaciones), '');
  v_motivo text := nullif(trim(p_motivo_consulta), '');
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_turno record;
begin
  -- Profesional activo y dueño del turno (si no, corta acá).
  perform public.fn_exigir_turno_propio(p_id_turno);

  if v_observaciones is null then
    raise exception 'Tenés que escribir las observaciones de la atención';
  end if;

  if char_length(v_observaciones) > 2000 then
    raise exception 'Las observaciones no pueden superar los 2000 caracteres';
  end if;

  if char_length(v_motivo) > 200 then
    raise exception 'El motivo de consulta no puede superar los 200 caracteres';
  end if;

  -- Bloquea la fila: un doble clic o dos pestañas se atienden de a una,
  -- y la segunda ya ve el estado 'atendido'.
  select t.estado, t.fecha, t.id_profesional, t.id_paciente
  into v_turno
  from public.turno t
  where t.id_turno = p_id_turno
  for update;

  if v_turno.estado = 'atendido' then
    raise exception 'La atención de este turno ya fue registrada. Si necesitás corregirla, usá "Editar atención"';
  end if;

  if v_turno.estado = 'cancelado' then
    raise exception 'No se puede registrar la atención de un turno cancelado';
  end if;

  if v_turno.estado = 'ausente' then
    raise exception 'No se puede registrar la atención de un turno marcado como ausente';
  end if;

  if v_turno.fecha <> v_hoy then
    raise exception 'Solo se puede registrar la atención de los turnos del día';
  end if;

  if v_turno.id_paciente is null then
    raise exception 'El turno no tiene un paciente asociado';
  end if;

  begin
    insert into public.atencion (
      id_turno,
      id_profesional,
      id_paciente,
      fecha_atencion,
      observaciones,
      motivo_consulta
    )
    values (
      p_id_turno,
      v_turno.id_profesional,
      v_turno.id_paciente,
      v_hoy,
      v_observaciones,
      v_motivo
    );
  exception when unique_violation then
    raise exception 'La atención de este turno ya fue registrada. Si necesitás corregirla, usá "Editar atención"';
  end;

  update public.turno
  set estado = 'atendido'
  where id_turno = p_id_turno;

  return public.fn_obtener_turno(p_id_turno);
end;
$$;

-- ============ HU-13: edición explícita de una atención ya registrada ============
-- Solo observaciones y motivo. Fecha, profesional y paciente no cambian.
create or replace function public.fn_editar_atencion(
  p_id_turno uuid,
  p_observaciones text,
  p_motivo_consulta text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observaciones text := nullif(trim(p_observaciones), '');
  v_motivo text := nullif(trim(p_motivo_consulta), '');
  v_id_atencion uuid;
begin
  perform public.fn_exigir_turno_propio(p_id_turno);

  if v_observaciones is null then
    raise exception 'Tenés que escribir las observaciones de la atención';
  end if;

  if char_length(v_observaciones) > 2000 then
    raise exception 'Las observaciones no pueden superar los 2000 caracteres';
  end if;

  if char_length(v_motivo) > 200 then
    raise exception 'El motivo de consulta no puede superar los 200 caracteres';
  end if;

  select a.id_atencion
  into v_id_atencion
  from public.atencion a
  where a.id_turno = p_id_turno
    and a.id_profesional = auth.uid()
  for update;

  if v_id_atencion is null then
    raise exception 'Este turno todavía no tiene una atención registrada';
  end if;

  update public.atencion
  set observaciones = v_observaciones,
      motivo_consulta = v_motivo,
      editado_en = now()
  where id_atencion = v_id_atencion;

  return public.fn_obtener_turno(p_id_turno);
end;
$$;

-- ============ HU-05/HU-06: un turno atendido sigue ocupando su horario ============
-- Copia de 005 con un único cambio: estado in ('confirmado', 'atendido').
create or replace function public.fn_consultar_disponibilidad(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date;
  v_ahora time;
  v_dia integer;
  v_duracion integer;
  v_paso integer;
  v_slots jsonb := '[]'::jsonb;
  v_franja record;
  v_inicio time;
  v_fin_slot time;
  v_ocupado boolean;
  v_nombre text;
  v_apellido text;
  v_servicio text;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar disponibilidad';
  end if;

  if p_id_profesional is null or p_id_servicio is null or p_fecha is null then
    raise exception 'Faltan campos';
  end if;

  v_hoy := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_ahora := (timezone('America/Argentina/Buenos_Aires', now()))::time;

  if p_fecha < v_hoy then
    raise exception 'No se puede consultar una fecha pasada';
  end if;

  if p_fecha > v_hoy + 30 then
    raise exception 'Solo se puede consultar disponibilidad hasta 30 días desde hoy';
  end if;

  -- Profesional activo + usuario activo + servicio asociado y activo
  select u.nombre_usuario, u.apellido_usuario
  into v_nombre, v_apellido
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario
  where p.id_usuario = p_id_profesional
    and p.activo = true
    and u.activo = true
    and u.rol_usuario = 'Profesional';

  if v_nombre is null then
    raise exception 'El profesional no existe o no está activo';
  end if;

  if not exists (
    select 1
    from public.servicio_profesional sp
    join public.servicio s on s.id_servicio = sp.id_servicio
    where sp.id_usuario = p_id_profesional
      and sp.id_servicio = p_id_servicio
      and s.activo = true
  ) then
    raise exception 'El servicio no está asociado a ese profesional o no está activo';
  end if;

  select s.nombre_servicio, s.duracion_minutos, s.granularidad_minutos
  into v_servicio, v_duracion, v_paso
  from public.servicio s
  where s.id_servicio = p_id_servicio;

  if v_duracion is null or v_duracion <= 0 then
    raise exception 'El servicio no tiene una duración válida';
  end if;

  if v_paso is null or v_paso <= 0 then
    v_paso := v_duracion;
  end if;

  -- ISO: lunes=1 .. domingo=7
  v_dia := extract(isodow from p_fecha)::integer;

  if not exists (
    select 1
    from public.franja_profesional f
    where f.id_usuario = p_id_profesional
      and f.dia_semana = v_dia
  ) then
    return jsonb_build_object(
      'fecha', p_fecha,
      'id_profesional', p_id_profesional,
      'nombre_profesional', v_nombre,
      'apellido_profesional', v_apellido,
      'id_servicio', p_id_servicio,
      'nombre_servicio', v_servicio,
      'duracion_minutos', v_duracion,
      'horarios', '[]'::jsonb,
      'mensaje', 'No hay horarios para esa fecha'
    );
  end if;

  for v_franja in
    select f.hora_inicio, f.hora_fin
    from public.franja_profesional f
    where f.id_usuario = p_id_profesional
      and f.dia_semana = v_dia
    order by f.hora_inicio
  loop
    v_inicio := v_franja.hora_inicio;

    while v_inicio + make_interval(mins => v_duracion) <= v_franja.hora_fin loop
      v_fin_slot := v_inicio + make_interval(mins => v_duracion);

      -- No ofrecer horarios pasados (solo el día de hoy)
      if p_fecha = v_hoy and v_inicio < v_ahora then
        v_inicio := v_inicio + make_interval(mins => v_paso);
        continue;
      end if;

      select exists (
        select 1
        from public.turno t
        where t.id_profesional = p_id_profesional
          and t.fecha = p_fecha
          and t.estado in ('confirmado', 'atendido') -- HU-13
          and t.hora_inicio < v_fin_slot
          and t.hora_fin > v_inicio
      ) into v_ocupado;

      if not v_ocupado then
        v_slots := v_slots || jsonb_build_array(to_char(v_inicio, 'HH24:MI'));
      end if;

      v_inicio := v_inicio + make_interval(mins => v_paso);
    end loop;
  end loop;

  return jsonb_build_object(
    'fecha', p_fecha,
    'id_profesional', p_id_profesional,
    'nombre_profesional', v_nombre,
    'apellido_profesional', v_apellido,
    'id_servicio', p_id_servicio,
    'nombre_servicio', v_servicio,
    'duracion_minutos', v_duracion,
    'horarios', v_slots,
    'mensaje', case
      when jsonb_array_length(v_slots) = 0 then 'No hay horarios para esa fecha'
      else null
    end
  );
end;
$$;

-- ============ HU-10A: un turno atendido no se cancela ============
-- Copia de 009 con un único cambio: el chequeo de 'atendido'.
create or replace function public.fn_cancelar_turno(
  p_id_turno uuid,
  p_motivo text,
  p_detalle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(trim(p_motivo), '');
  v_detalle text := nullif(trim(p_detalle), '');
  v_ahora timestamp;
  v_profesional uuid;
  v_fecha date;
  v_turno record;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para cancelar turnos';
  end if;

  if p_id_turno is null then
    raise exception 'Faltan campos';
  end if;

  if v_motivo is null then
    raise exception 'Tenés que indicar el motivo de la cancelación';
  end if;

  if v_motivo not in ('pedido_paciente', 'profesional', 'otro') then
    raise exception 'El motivo de cancelación no es válido';
  end if;

  if char_length(v_detalle) > 200 then
    raise exception 'El detalle no puede superar los 200 caracteres';
  end if;

  select t.id_profesional, t.fecha
  into v_profesional, v_fecha
  from public.turno t
  where t.id_turno = p_id_turno;

  if v_profesional is null then
    raise exception 'El turno no existe';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_profesional::text || v_fecha::text, 0)
  );

  select t.estado, t.fecha, t.hora_inicio
  into v_turno
  from public.turno t
  where t.id_turno = p_id_turno
  for update;

  if v_turno.estado = 'cancelado' then
    raise exception 'El turno ya está cancelado';
  end if;

  if v_turno.estado = 'ausente' then
    raise exception 'El turno ya fue marcado como ausente';
  end if;

  -- HU-13
  if v_turno.estado = 'atendido' then
    raise exception 'El turno ya fue atendido; no se puede cancelar';
  end if;

  v_ahora := timezone('America/Argentina/Buenos_Aires', now());
  if v_turno.fecha + v_turno.hora_inicio <= v_ahora then
    raise exception 'El turno ya pasó; corresponde marcarlo como Ausente';
  end if;

  update public.turno
  set estado = 'cancelado',
      motivo_cancelacion = v_motivo,
      detalle_cancelacion = v_detalle,
      cancelado_en = now(),
      cancelado_por = auth.uid()
  where id_turno = p_id_turno;

  return public.fn_obtener_turno(p_id_turno);
end;
$$;

-- ============ Permisos ============
revoke all on function public.fn_obtener_turno(uuid) from public, anon;
revoke all on function public.fn_consultar_agenda_profesional(uuid, date) from public, anon;
revoke all on function public.fn_registrar_atencion(uuid, text, text) from public, anon;
revoke all on function public.fn_editar_atencion(uuid, text, text) from public, anon;
revoke all on function public.fn_consultar_disponibilidad(uuid, uuid, date) from public, anon;
revoke all on function public.fn_cancelar_turno(uuid, text, text) from public, anon;

grant execute on function public.fn_obtener_turno(uuid) to authenticated;
grant execute on function public.fn_consultar_agenda_profesional(uuid, date) to authenticated;
grant execute on function public.fn_registrar_atencion(uuid, text, text) to authenticated;
grant execute on function public.fn_editar_atencion(uuid, text, text) to authenticated;
grant execute on function public.fn_consultar_disponibilidad(uuid, uuid, date) to authenticated;
grant execute on function public.fn_cancelar_turno(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
