-- HU-10A. Cancelar un turno.
-- Cancelar NO borra: el turno queda 'cancelado' con su motivo (lo usan HU-16 y HU-18).
-- Como turno_sin_superposicion y fn_consultar_disponibilidad solo miran 'confirmado',
-- el horario queda libre sin tocar esas piezas.
begin;

alter table public.turno
  add column if not exists motivo_cancelacion text,
  add column if not exists detalle_cancelacion text,
  add column if not exists cancelado_en timestamptz,
  add column if not exists cancelado_por uuid references public.usuario (id_usuario);

alter table public.turno
  add constraint turno_motivo_cancelacion_valido
    check (motivo_cancelacion in ('pedido_paciente', 'profesional', 'otro')),
  add constraint turno_detalle_cancelacion_largo
    check (char_length(detalle_cancelacion) <= 200),
  -- Un turno cancelado siempre tiene motivo.
  add constraint turno_cancelado_con_motivo
    check (estado <> 'cancelado' or motivo_cancelacion is not null);

-- HU-06 + datos de cancelación y 'cancelable' (para mostrar o no el botón).
-- La regla de "ya pasó" se calcula acá, con la hora de Argentina, no en el navegador.
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
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar turnos';
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
    'cancelable', (t.estado = 'confirmado' and t.fecha + t.hora_inicio > v_ahora)
  )
  into v_resultado
  from public.turno t
  join public.paciente pa on pa.id_paciente = t.id_paciente
  join public.usuario u on u.id_usuario = t.id_profesional
  join public.servicio s on s.id_servicio = t.id_servicio
  left join public.obra_social o on o.id_obra_social = t.id_obra_social
  where t.id_turno = p_id_turno;

  if v_resultado is null then
    raise exception 'El turno no existe';
  end if;

  return v_resultado;
end;
$$;

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

  -- Profesional y fecha no cambian nunca: los leo para tomar el MISMO lock
  -- que fn_otorgar_turno, así no compiten una cancelación y un otorgamiento.
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

  -- Mismo criterio que fn_otorgar_turno: hora local de Argentina.
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

-- HU-07: ahora también devuelve los cancelados (identificados), ordenados por hora.
-- Si en un horario hay un cancelado y uno nuevo confirmado, el confirmado va primero.
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
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar la agenda';
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
          'motivo_cancelacion', t.motivo_cancelacion
        )
        order by t.hora_inicio, (t.estado = 'cancelado'), t.creado
      )
      from public.turno t
      join public.paciente pa on pa.id_paciente = t.id_paciente
      join public.servicio s on s.id_servicio = t.id_servicio
      where t.id_profesional = p_id_profesional
        and t.fecha = p_fecha
        and t.estado in ('confirmado', 'cancelado')
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.fn_obtener_turno(uuid) from public, anon;
revoke all on function public.fn_cancelar_turno(uuid, text, text) from public, anon;
revoke all on function public.fn_consultar_agenda_profesional(uuid, date) from public, anon;

grant execute on function public.fn_obtener_turno(uuid) to authenticated;
grant execute on function public.fn_cancelar_turno(uuid, text, text) to authenticated;
grant execute on function public.fn_consultar_agenda_profesional(uuid, date) to authenticated;

commit;
