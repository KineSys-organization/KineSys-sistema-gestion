-- HU-24A. Registrar la orden médica al atender un turno (Profesional). Issue #44.
--
-- La orden médica (diagnóstico, indicaciones, tratamiento) es un texto libre OPCIONAL
-- que vive en la misma fila de atencion (1:1 con el turno, HU-13). Por eso ya queda
-- atada al turno, al paciente y al profesional, y reutiliza registrado_en / editado_en
-- (no se agregan columnas de fecha).
--
-- El historial de órdenes de un paciente (HU-24B) va a leer atencion por id_paciente
-- (ya existe idx_atencion_paciente): no hace falta nada más acá.
--
-- Cambios:
--   * atencion.orden_medica (null = sin orden), máximo 2000 caracteres.
--   * fn_registrar_atencion y fn_editar_atencion suman p_orden_medica (default null).
--     OJO: agregar un parámetro en Postgres crea OTRA función y deja viva la vieja
--     (rpc quedaría ambiguo). Por eso se hace drop de la firma de 3 parámetros y se
--     recrean con 4. Llamarlas con 3 argumentos sigue funcionando por el default.
--   * fn_obtener_turno (copia de 015): suma orden_medica SOLO dentro de 'atencion',
--     que únicamente se arma para el profesional que atendió. Recepción recibe null.
begin;

-- ============ Columna nueva ============
alter table public.atencion
  add column orden_medica text;

alter table public.atencion
  add constraint atencion_orden_medica_largo
    check (orden_medica is null or char_length(orden_medica) <= 2000);

-- ============ Se borran las firmas viejas (HU-13) ============
drop function if exists public.fn_registrar_atencion(uuid, text, text);
drop function if exists public.fn_editar_atencion(uuid, text, text);

-- ============ HU-13 + HU-24A: registrar la atención ============
-- Copia de 010 con un único cambio: la orden médica opcional.
create function public.fn_registrar_atencion(
  p_id_turno uuid,
  p_observaciones text,
  p_motivo_consulta text default null,
  p_orden_medica text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observaciones text := nullif(trim(p_observaciones), '');
  v_motivo text := nullif(trim(p_motivo_consulta), '');
  -- HU-24A: solo espacios = sin orden.
  v_orden text := nullif(trim(p_orden_medica), '');
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

  if char_length(v_orden) > 2000 then
    raise exception 'La orden médica no puede superar los 2000 caracteres';
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
      motivo_consulta,
      orden_medica
    )
    values (
      p_id_turno,
      v_turno.id_profesional,
      v_turno.id_paciente,
      v_hoy,
      v_observaciones,
      v_motivo,
      v_orden
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

-- ============ HU-13 + HU-24A: edición explícita de una atención ya registrada ============
-- Copia de 010 con un único cambio: la orden médica. Fecha, profesional y paciente no cambian.
-- La orden se guarda tal cual llega: si el profesional la vacía, queda null (se quita).
create function public.fn_editar_atencion(
  p_id_turno uuid,
  p_observaciones text,
  p_motivo_consulta text default null,
  p_orden_medica text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observaciones text := nullif(trim(p_observaciones), '');
  v_motivo text := nullif(trim(p_motivo_consulta), '');
  v_orden text := nullif(trim(p_orden_medica), '');
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

  if char_length(v_orden) > 2000 then
    raise exception 'La orden médica no puede superar los 2000 caracteres';
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
      orden_medica = v_orden,
      editado_en = now()
  where id_atencion = v_id_atencion;

  return public.fn_obtener_turno(p_id_turno);
end;
$$;

-- ============ Detalle del turno: suma la orden médica (solo al profesional) ============
-- Copia de 015 con un único dato nuevo dentro de 'atencion'.
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
    -- HU-24A: la orden médica va acá adentro, así Recepción tampoco la recibe.
    'atencion', case
      when a.id_atencion is not null and a.id_profesional = auth.uid() then
        jsonb_build_object(
          'fecha_atencion', a.fecha_atencion,
          'observaciones', a.observaciones,
          'motivo_consulta', a.motivo_consulta,
          'orden_medica', a.orden_medica,
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

-- ============ Permisos (los mismos que tenían, con las firmas nuevas) ============
revoke all on function public.fn_registrar_atencion(uuid, text, text, text) from public, anon;
revoke all on function public.fn_editar_atencion(uuid, text, text, text) from public, anon;
revoke all on function public.fn_obtener_turno(uuid) from public, anon;

grant execute on function public.fn_registrar_atencion(uuid, text, text, text) to authenticated;
grant execute on function public.fn_editar_atencion(uuid, text, text, text) to authenticated;
grant execute on function public.fn_obtener_turno(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
