-- HU-10B. Marcar la ausencia de un turno y corregirla si fue un error.
--
-- El estado 'ausente' ya existe en turno_estado_valido (HU-06). Esta migración suma:
--   * fn_marcar_ausente: Confirmado, sin atención y con la hora de fin ya pasada → Ausente.
--   * fn_corregir_ausencia: únicamente Ausente → Confirmado (el resto del turno no cambia).
--   * turno_sin_superposicion: un turno ausente sigue ocupando su horario.
--   * fn_obtener_turno: 'marcable_ausente' y 'ausencia_corregible' (para mostrar los botones).
--   * fn_consultar_agenda_profesional: devuelve también los turnos 'ausente'.
--
-- fn_consultar_disponibilidad no cambia: un turno recién se puede marcar ausente cuando
-- terminó, y la disponibilidad nunca ofrece horarios pasados, así que su horario no
-- puede volver a ofrecerse. La restricción EXCLUDE queda como última defensa.
begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

-- ============ Un turno ausente sigue ocupando su horario ============
-- (Hasta esta migración no hay turnos 'ausente', así que recrearla no puede fallar.)
alter table public.turno drop constraint if exists turno_sin_superposicion;
alter table public.turno
  add constraint turno_sin_superposicion exclude using gist (
    id_profesional with =,
    tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') with &&
  ) where (estado in ('confirmado', 'atendido', 'ausente'));

-- ============ Marcar ausencia ============
create or replace function public.fn_marcar_ausente(p_id_turno uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional uuid;
  v_fecha date;
  v_turno record;
  v_ahora timestamp;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para marcar ausencias';
  end if;

  if p_id_turno is null then
    raise exception 'Faltan campos';
  end if;

  select t.id_profesional, t.fecha
  into v_profesional, v_fecha
  from public.turno t
  where t.id_turno = p_id_turno;

  if v_profesional is null then
    raise exception 'El turno no existe';
  end if;

  -- Mismo lock que otorgar / cancelar / reprogramar (profesional + día).
  perform pg_advisory_xact_lock(
    hashtextextended(v_profesional::text || v_fecha::text, 0)
  );

  select t.estado, t.fecha, t.hora_fin
  into v_turno
  from public.turno t
  where t.id_turno = p_id_turno
  for update;

  if v_turno.estado = 'ausente' then
    raise exception 'El turno ya está marcado como ausente';
  end if;

  if v_turno.estado = 'cancelado' then
    raise exception 'No se puede marcar como ausente un turno cancelado';
  end if;

  if v_turno.estado = 'atendido' or exists (
    select 1 from public.atencion a where a.id_turno = p_id_turno
  ) then
    raise exception 'El turno tiene una atención registrada; no se puede marcar como ausente';
  end if;

  -- Antes del inicio y durante el turno no se puede (hora de Argentina).
  v_ahora := timezone('America/Argentina/Buenos_Aires', now());
  if v_turno.fecha + v_turno.hora_fin > v_ahora then
    raise exception 'Solo se puede marcar la ausencia cuando terminó el horario del turno';
  end if;

  update public.turno
  set estado = 'ausente'
  where id_turno = p_id_turno;

  return public.fn_obtener_turno(p_id_turno);
end;
$$;

-- ============ Corregir una ausencia marcada por error ============
-- Únicamente Ausente → Confirmado. No cambia fecha, hora ni ningún otro dato,
-- y no habilita registrar la atención fuera del día del turno (lo sigue validando HU-13).
create or replace function public.fn_corregir_ausencia(p_id_turno uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional uuid;
  v_fecha date;
  v_estado text;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para corregir ausencias';
  end if;

  if p_id_turno is null then
    raise exception 'Faltan campos';
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

  select t.estado
  into v_estado
  from public.turno t
  where t.id_turno = p_id_turno
  for update;

  if v_estado <> 'ausente' then
    raise exception 'Solo se puede corregir la ausencia de un turno marcado como ausente';
  end if;

  update public.turno
  set estado = 'confirmado'
  where id_turno = p_id_turno;

  return public.fn_obtener_turno(p_id_turno);
end;
$$;

-- ============ HU-06/HU-10A/HU-12 + HU-10B: detalle de un turno ============
-- Copia de 010 con dos datos nuevos: 'marcable_ausente' y 'ausencia_corregible'.
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

-- ============ HU-07/HU-12 + HU-10B: la agenda muestra también los ausentes ============
-- Copia de 010 con un único cambio: estado in (..., 'ausente').
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
        and t.estado in ('confirmado', 'cancelado', 'atendido', 'ausente')
    ),
    '[]'::jsonb
  );
end;
$$;

-- ============ Permisos ============
revoke all on function public.fn_marcar_ausente(uuid) from public, anon;
revoke all on function public.fn_corregir_ausencia(uuid) from public, anon;
revoke all on function public.fn_obtener_turno(uuid) from public, anon;
revoke all on function public.fn_consultar_agenda_profesional(uuid, date) from public, anon;

grant execute on function public.fn_marcar_ausente(uuid) to authenticated;
grant execute on function public.fn_corregir_ausencia(uuid) to authenticated;
grant execute on function public.fn_obtener_turno(uuid) to authenticated;
grant execute on function public.fn_consultar_agenda_profesional(uuid, date) to authenticated;

notify pgrst, 'reload schema';

commit;
