-- HU-10C. Reprogramar un turno confirmado a otro horario disponible.
--
-- Reprogramar actualiza EL MISMO turno (id, paciente, profesional, servicio, cobertura):
-- solo cambian fecha, hora de inicio y hora de fin. Es atómico: si alguna validación
-- falla, el turno original no se toca.
--
-- Para poder mover un turno a un horario que se superpone con el suyo (ej.: correrlo
-- 15 minutos), la disponibilidad tiene que ignorar al propio turno. Por eso
-- fn_consultar_disponibilidad y fn_consultar_disponibilidad_calendario suman un
-- parámetro opcional p_excluir_turno (default null = igual que antes). Se borran y se
-- recrean: si se agregara el parámetro con create or replace quedarían dos versiones
-- y las llamadas con 3 argumentos serían ambiguas.
--
-- Cambios:
--   * fn_consultar_disponibilidad(profesional, servicio, fecha, excluir_turno)
--   * fn_consultar_disponibilidad_calendario(profesional, servicio, excluir_turno)
--   * fn_reprogramar_turno(turno, fecha, hora)
--   * fn_obtener_turno suma 'reprogramable' (confirmado y todavía no empezó).
begin;

-- ============ HU-05 + HU-10C: disponibilidad ignorando un turno ============
drop function if exists public.fn_consultar_disponibilidad(uuid, uuid, date);

-- Copia de 010 con dos cambios: p_excluir_turno y el estado 'ausente' (HU-10B) como ocupado.
create function public.fn_consultar_disponibilidad(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_excluir_turno uuid default null
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
          and t.estado in ('confirmado', 'atendido', 'ausente') -- HU-13 / HU-10B
          and t.id_turno is distinct from p_excluir_turno -- HU-10C
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

-- ============ Calendario de 30 días (011) ignorando un turno ============
drop function if exists public.fn_consultar_disponibilidad_calendario(uuid, uuid);

-- Copia de 011 con un único cambio: p_excluir_turno se pasa a fn_consultar_disponibilidad.
create function public.fn_consultar_disponibilidad_calendario(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_excluir_turno uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_dia date;
  v_disp jsonb;
  v_dias jsonb := '[]'::jsonb;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar disponibilidad';
  end if;

  if p_id_profesional is null or p_id_servicio is null then
    raise exception 'Faltan campos';
  end if;

  for v_dia in
    select d::date from generate_series(v_hoy, v_hoy + 30, interval '1 day') d
  loop
    -- Valida profesional y servicio (si fallan, corta en el primer día).
    v_disp := public.fn_consultar_disponibilidad(
      p_id_profesional, p_id_servicio, v_dia, p_excluir_turno
    );
    v_dias := v_dias || jsonb_build_array(jsonb_build_object(
      'fecha', v_dia,
      'libres', jsonb_array_length(v_disp -> 'horarios')
    ));
  end loop;

  return jsonb_build_object(
    'desde', v_hoy,
    'hasta', v_hoy + 30,
    'nombre_profesional', v_disp ->> 'nombre_profesional',
    'apellido_profesional', v_disp ->> 'apellido_profesional',
    'nombre_servicio', v_disp ->> 'nombre_servicio',
    'duracion_minutos', (v_disp ->> 'duracion_minutos')::integer,
    'dias', v_dias
  );
end;
$$;

-- ============ HU-10C: reprogramar ============
create or replace function public.fn_reprogramar_turno(
  p_id_turno uuid,
  p_fecha date,
  p_hora time
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional uuid;
  v_fecha_actual date;
  v_lock_actual bigint;
  v_lock_nuevo bigint;
  v_turno record;
  v_ahora timestamp;
  v_disp jsonb;
  v_duracion integer;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para reprogramar turnos';
  end if;

  if p_id_turno is null or p_fecha is null or p_hora is null then
    raise exception 'Faltan campos';
  end if;

  select t.id_profesional, t.fecha
  into v_profesional, v_fecha_actual
  from public.turno t
  where t.id_turno = p_id_turno;

  if v_profesional is null then
    raise exception 'El turno no existe';
  end if;

  -- Mismo lock que otorgar / cancelar (profesional + día), pero de los DOS días:
  -- el que se libera y el que se ocupa. Siempre en el mismo orden (menor primero)
  -- para que dos reprogramaciones cruzadas no se traben entre sí.
  v_lock_actual := hashtextextended(v_profesional::text || v_fecha_actual::text, 0);
  v_lock_nuevo := hashtextextended(v_profesional::text || p_fecha::text, 0);
  perform pg_advisory_xact_lock(least(v_lock_actual, v_lock_nuevo));
  if v_lock_actual <> v_lock_nuevo then
    perform pg_advisory_xact_lock(greatest(v_lock_actual, v_lock_nuevo));
  end if;

  select t.estado, t.fecha, t.hora_inicio, t.id_servicio
  into v_turno
  from public.turno t
  where t.id_turno = p_id_turno
  for update;

  -- Otra reprogramación lo movió mientras esperábamos el lock.
  if v_turno.fecha <> v_fecha_actual then
    raise exception 'El turno cambió mientras lo reprogramabas; volvé a intentarlo';
  end if;

  if v_turno.estado = 'cancelado' then
    raise exception 'No se puede reprogramar un turno cancelado';
  end if;

  if v_turno.estado = 'atendido' then
    raise exception 'No se puede reprogramar un turno atendido';
  end if;

  if v_turno.estado = 'ausente' then
    raise exception 'No se puede reprogramar un turno marcado como ausente';
  end if;

  -- Hora de Argentina, igual que HU-06 / HU-10A. Un turno en curso tampoco se mueve.
  v_ahora := timezone('America/Argentina/Buenos_Aires', now());
  if v_turno.fecha + v_turno.hora_inicio <= v_ahora then
    raise exception 'El turno ya comenzó o pasó; no se puede reprogramar';
  end if;

  if p_fecha + p_hora < v_ahora then
    raise exception 'No se puede reprogramar a una fecha y hora pasada';
  end if;

  if p_fecha = v_turno.fecha and p_hora = v_turno.hora_inicio then
    raise exception 'Elegí un horario distinto al actual';
  end if;

  -- Revalidación: reutiliza HU-05 (profesional activo con el servicio, franjas,
  -- granularidad, 30 días, ocupación) sin contar a este mismo turno.
  v_disp := public.fn_consultar_disponibilidad(
    v_profesional, v_turno.id_servicio, p_fecha, p_id_turno
  );

  if not ((v_disp -> 'horarios') ? to_char(p_hora, 'HH24:MI')) then
    raise exception 'El horario seleccionado ya no está disponible';
  end if;

  v_duracion := (v_disp ->> 'duracion_minutos')::integer;

  begin
    update public.turno
    set fecha = p_fecha,
        hora_inicio = p_hora,
        hora_fin = p_hora + make_interval(mins => v_duracion)
    where id_turno = p_id_turno;
  exception when exclusion_violation then
    -- Última defensa: la restricción EXCLUDE detectó un solapamiento.
    raise exception 'El horario seleccionado ya no está disponible';
  end;

  return public.fn_obtener_turno(p_id_turno);
end;
$$;

-- ============ Detalle del turno: suma 'reprogramable' ============
-- Copia de 014 con un único dato nuevo.
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
    -- HU-10C: mismo criterio que cancelar (confirmado y todavía no empezó).
    'reprogramable', (t.estado = 'confirmado' and t.fecha + t.hora_inicio > v_ahora),
    -- HU-10B: confirmado, sin atención y ya terminó.
    'marcable_ausente', (
      t.estado = 'confirmado'
      and a.id_atencion is null
      and t.fecha + t.hora_fin <= v_ahora
    ),
    'ausencia_corregible', (t.estado = 'ausente'),
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

-- ============ Permisos ============
revoke all on function public.fn_consultar_disponibilidad(uuid, uuid, date, uuid) from public, anon;
revoke all on function public.fn_consultar_disponibilidad_calendario(uuid, uuid, uuid) from public, anon;
revoke all on function public.fn_reprogramar_turno(uuid, date, time) from public, anon;
revoke all on function public.fn_obtener_turno(uuid) from public, anon;

grant execute on function public.fn_consultar_disponibilidad(uuid, uuid, date, uuid) to authenticated;
grant execute on function public.fn_consultar_disponibilidad_calendario(uuid, uuid, uuid) to authenticated;
grant execute on function public.fn_reprogramar_turno(uuid, date, time) to authenticated;
grant execute on function public.fn_obtener_turno(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
