-- HU-38. Orden médica con datos automáticos del paciente, sesiones y detalle. Issue #72.
--
-- Corrección de la revisión del Incremento 2 sobre HU-24A (019): la orden ya no es un
-- único texto libre. Los datos del paciente, la cobertura, el profesional, el servicio y
-- la fecha salen solos del turno (se leen al mostrarla, el front no los manda) y el
-- profesional completa solo:
--   * la cantidad de sesiones (1..50) -> columna nueva atencion.orden_sesiones;
--   * el detalle (diagnóstico, indicaciones, tratamiento) -> atencion.orden_medica (la de 019).
--
-- Sigue viviendo en atencion (1:1 con el turno). No se crea otra tabla.
--
-- Reglas:
--   * La orden es opcional. Si se carga, van las dos cosas: sesiones y detalle.
--   * Órdenes viejas (HU-24A) quedan con detalle y sesiones null: se siguen viendo
--     ("Sesiones: no informadas") y, al editar la atención, se pueden dejar como están.
--     Si se cambia el detalle, ahí sí se piden las sesiones.
--   * Sesiones sin detalle nunca (check de la tabla, última defensa).
--
-- fn_registrar_atencion y fn_editar_atencion suman p_orden_sesiones (default null) con
-- drop + create, para que PostgREST no quede con dos versiones. fn_obtener_turno (copia de
-- 019) suma dentro de 'atencion' las sesiones y la cobertura, y la matrícula del profesional.
begin;

-- ============ Columna nueva + checks ============
alter table public.atencion
  add column orden_sesiones smallint;

alter table public.atencion
  add constraint atencion_orden_sesiones_rango
    check (orden_sesiones is null or orden_sesiones between 1 and 50);

-- Sesiones sin detalle no. Detalle sin sesiones sí (órdenes de HU-24A).
alter table public.atencion
  add constraint atencion_orden_completa
    check (orden_sesiones is null or orden_medica is not null);

-- ============ Se borran las firmas de HU-24A ============
drop function if exists public.fn_registrar_atencion(uuid, text, text, text);
drop function if exists public.fn_editar_atencion(uuid, text, text, text);

-- ============ HU-13 + HU-24A + HU-38: registrar la atención ============
-- Copia de 019. Cambio: la orden, si se carga, exige sesiones (1..50) y detalle.
create function public.fn_registrar_atencion(
  p_id_turno uuid,
  p_observaciones text,
  p_motivo_consulta text default null,
  p_orden_medica text default null,
  p_orden_sesiones integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observaciones text := nullif(trim(p_observaciones), '');
  v_motivo text := nullif(trim(p_motivo_consulta), '');
  -- Detalle de la orden: solo espacios = sin orden.
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

  -- HU-38: sin orden = las dos cosas vacías. Si viene una, tiene que venir la otra.
  if v_orden is not null and p_orden_sesiones is null then
    raise exception 'Indicá la cantidad de sesiones';
  end if;

  if v_orden is null and p_orden_sesiones is not null then
    raise exception 'Completá el detalle de la orden';
  end if;

  if p_orden_sesiones is not null and (p_orden_sesiones < 1 or p_orden_sesiones > 50) then
    raise exception 'La cantidad de sesiones tiene que ser entre 1 y 50';
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
      orden_medica,
      orden_sesiones
    )
    values (
      p_id_turno,
      v_turno.id_profesional,
      v_turno.id_paciente,
      v_hoy,
      v_observaciones,
      v_motivo,
      v_orden,
      p_orden_sesiones
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

-- ============ HU-13 + HU-24A + HU-38: editar la atención ============
-- Copia de 019. Cambio: sesiones + detalle. Vaciar los dos = quitar la orden.
create function public.fn_editar_atencion(
  p_id_turno uuid,
  p_observaciones text,
  p_motivo_consulta text default null,
  p_orden_medica text default null,
  p_orden_sesiones integer default null
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
  v_actual public.atencion;
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

  if v_orden is null and p_orden_sesiones is not null then
    raise exception 'Completá el detalle de la orden';
  end if;

  if p_orden_sesiones is not null and (p_orden_sesiones < 1 or p_orden_sesiones > 50) then
    raise exception 'La cantidad de sesiones tiene que ser entre 1 y 50';
  end if;

  if char_length(v_orden) > 2000 then
    raise exception 'La orden médica no puede superar los 2000 caracteres';
  end if;

  select a.*
  into v_actual
  from public.atencion a
  where a.id_turno = p_id_turno
    and a.id_profesional = auth.uid()
  for update;

  if v_actual.id_atencion is null then
    raise exception 'Este turno todavía no tiene una atención registrada';
  end if;

  -- Detalle sin sesiones: solo si es una orden vieja de HU-24A que no se tocó.
  if v_orden is not null and p_orden_sesiones is null
    and not (v_actual.orden_sesiones is null and v_actual.orden_medica = v_orden) then
    raise exception 'Indicá la cantidad de sesiones';
  end if;

  update public.atencion
  set observaciones = v_observaciones,
      motivo_consulta = v_motivo,
      orden_medica = v_orden,
      orden_sesiones = p_orden_sesiones,
      editado_en = now()
  where id_atencion = v_actual.id_atencion;

  return public.fn_obtener_turno(p_id_turno);
end;
$$;

-- ============ Detalle del turno: la orden con sus datos automáticos ============
-- Parte de la versión de HU-17 (024_hu17_estado_cobro, ya aplicada en la base: estado_cobro).
-- Copia de 019. Dentro de 'atencion' (solo el profesional que atendió) se suman las
-- sesiones y la cobertura del turno; arriba, la matrícula del profesional. Así la orden
-- impresa se arma sin que el front mande nada.
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
    -- HU-38: encabezado de la orden médica (dato profesional, no clínico).
    'matricula_profesional', pr.matricula,
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
    -- HU-17: estado de cobro. El Profesional no lo ve (recibe null).
    'estado_cobro', case
      when v_es_recepcion then
        public.fn_estado_cobro(t.estado, p.id_pago is not null, r.id_reembolso is not null)
      else null
    end,
    -- HU-13: la atención (observaciones clínicas) solo la ve el profesional que atendió.
    -- HU-24A: la orden médica va acá adentro, así Recepción tampoco la recibe.
    'atencion', case
      when a.id_atencion is not null and a.id_profesional = auth.uid() then
        jsonb_build_object(
          'fecha_atencion', a.fecha_atencion,
          'observaciones', a.observaciones,
          'motivo_consulta', a.motivo_consulta,
          'orden_medica', a.orden_medica,
          -- HU-38: sesiones y datos automáticos de la orden (leídos de la base, no del front).
          'orden_sesiones', a.orden_sesiones,
          'orden_cobertura', coalesce(o.nombre_obra_social, 'Particular'),
          'orden_numero_afiliado', t.numero_afiliado,
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
  left join public.profesional pr on pr.id_usuario = t.id_profesional -- HU-38
  left join public.obra_social o on o.id_obra_social = t.id_obra_social
  left join public.atencion a on a.id_turno = t.id_turno
  left join public.pago p on p.id_turno = t.id_turno -- HU-17
  left join public.reembolso r on r.id_pago = p.id_pago -- HU-17
  where t.id_turno = p_id_turno;

  if v_resultado is null then
    raise exception 'El turno no existe';
  end if;

  return v_resultado;
end;
$$;

-- ============ Permisos (los mismos, con las firmas nuevas) ============
revoke all on function public.fn_registrar_atencion(uuid, text, text, text, integer) from public, anon;
revoke all on function public.fn_editar_atencion(uuid, text, text, text, integer) from public, anon;
revoke all on function public.fn_obtener_turno(uuid) from public, anon;

grant execute on function public.fn_registrar_atencion(uuid, text, text, text, integer) to authenticated;
grant execute on function public.fn_editar_atencion(uuid, text, text, text, integer) to authenticated;
grant execute on function public.fn_obtener_turno(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
