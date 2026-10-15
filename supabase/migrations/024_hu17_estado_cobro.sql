-- HU-17. Estado de cobro de cada turno (Recepción y Gerente).
--
-- El estado de cobro NO se guarda: se calcula con una sola regla (fn_estado_cobro) a partir
-- del estado del turno y de si tiene pago (HU-14) y reembolso (HU-22):
--
--   reembolsado    → su pago tiene reembolso
--   pagado         → tiene pago (aunque después se haya cancelado o marcado ausente)
--   pendiente      → confirmado o atendido, sin pago
--   no_corresponde → cancelado o ausente, sin pago
--
-- Por ser calculado, sale solo que: registrar el pago lo pasa a pagado; cancelar o marcar
-- ausente un turno pagado lo deja pagado; corregir una ausencia sin pago vuelve a pendiente.
--
-- La regla se reutiliza en (copias de su última versión + el estado de cobro):
--   * fn_obtener_turno (019)                → 'estado_cobro' (solo Recepción; Profesional: null)
--   * fn_consultar_agenda_profesional (014) → 'estado_cobro' por turno (solo Recepción)
--   * fn_buscar_turnos (016)                → 'estado_cobro' por fila + filtro p_estado_cobro
--     (cambia la firma: se hace drop de la de 7 parámetros, no dejar dos versiones)
--   * fn_obtener_pago (023)                 → turno.estado_cobro (lo usará el comprobante, HU-35)
--
-- No crea tablas ni cambia datos.
begin;

-- ============ La regla (única) ============
-- Interna: la usan las fn_* security definer. Pura: solo depende de sus parámetros.
create or replace function public.fn_estado_cobro(
  p_estado_turno text,
  p_tiene_pago boolean,
  p_tiene_reembolso boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_tiene_reembolso, false) then 'reembolsado'
    when coalesce(p_tiene_pago, false) then 'pagado'
    when p_estado_turno in ('confirmado', 'atendido') then 'pendiente'
    else 'no_corresponde'
  end;
$$;

revoke all on function public.fn_estado_cobro(text, boolean, boolean)
  from public, anon, authenticated;

-- ============ Detalle del turno (019 + estado de cobro) ============
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
  left join public.pago p on p.id_turno = t.id_turno -- HU-17
  left join public.reembolso r on r.id_pago = p.id_pago -- HU-17
  where t.id_turno = p_id_turno;

  if v_resultado is null then
    raise exception 'El turno no existe';
  end if;

  return v_resultado;
end;
$$;

-- ============ Agenda de un profesional (014 + estado de cobro) ============
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
  v_es_recepcion boolean := public.fn_es_recepcion(); -- HU-17
begin
  -- Recepción consulta la agenda de cualquier profesional (HU-07).
  -- Un Profesional solo la suya (HU-12): el id tiene que ser el de su sesión.
  if not v_es_recepcion then
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
          'atendible', (t.estado = 'confirmado' and t.fecha = v_hoy),
          -- HU-17: estado de cobro. En "Mi agenda" del Profesional va null.
          'estado_cobro', case
            when v_es_recepcion then
              public.fn_estado_cobro(t.estado, pg.id_pago is not null, r.id_reembolso is not null)
            else null
          end
        )
        order by t.hora_inicio, (t.estado = 'cancelado'), t.creado
      )
      from public.turno t
      join public.paciente pa on pa.id_paciente = t.id_paciente
      join public.servicio s on s.id_servicio = t.id_servicio
      left join public.pago pg on pg.id_turno = t.id_turno -- HU-17
      left join public.reembolso r on r.id_pago = pg.id_pago -- HU-17
      where t.id_profesional = p_id_profesional
        and t.fecha = p_fecha
        and t.estado in ('confirmado', 'cancelado', 'atendido', 'ausente')
    ),
    '[]'::jsonb
  );
end;
$$;

-- ============ Listado de turnos (016 + estado de cobro y su filtro) ============
-- p_estado_cobro: null o 'todos' = todos; si no, pendiente / pagado / reembolsado / no_corresponde.
drop function if exists public.fn_buscar_turnos(text, uuid, uuid, date, date, text, integer);

create or replace function public.fn_buscar_turnos(
  p_texto text default null,
  p_id_profesional uuid default null,
  p_id_servicio uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_estado text default null,
  p_pagina integer default 1,
  p_estado_cobro text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_por_pagina constant integer := 10;
  v_texto text := trim(coalesce(p_texto, ''));
  v_palabras text[];
  v_estado text := lower(nullif(trim(coalesce(p_estado, '')), ''));
  v_cobro text := lower(nullif(trim(coalesce(p_estado_cobro, '')), '')); -- HU-17
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_resultado jsonb;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar turnos';
  end if;

  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then
    raise exception 'La fecha Hasta no puede ser anterior a Desde';
  end if;

  if v_estado = 'todos' then
    v_estado := null;
  end if;

  if v_estado is not null
    and v_estado not in ('confirmado', 'cancelado', 'atendido', 'ausente') then
    raise exception 'El estado no es válido';
  end if;

  if v_cobro = 'todos' then
    v_cobro := null;
  end if;

  if v_cobro is not null
    and v_cobro not in ('pendiente', 'pagado', 'reembolsado', 'no_corresponde') then
    raise exception 'El estado de cobro no es válido';
  end if;

  if char_length(v_texto) > 100 then
    raise exception 'La búsqueda no puede superar los 100 caracteres';
  end if;

  if v_texto <> '' then
    v_palabras := regexp_split_to_array(lower(v_texto), '\s+');
  end if;

  -- "coincidencias" se usa dos veces: para el total y para armar la página.
  with base as (
    select
      t.id_turno,
      t.fecha,
      t.hora_inicio,
      t.hora_fin,
      t.estado,
      t.motivo_cancelacion,
      pa.id_paciente,
      pa.nombre_paciente,
      pa.apellido_paciente,
      pa.dni_paciente,
      t.id_profesional,
      u.nombre_usuario,
      u.apellido_usuario,
      t.id_servicio,
      s.nombre_servicio,
      -- HU-17: misma regla que el detalle y la agenda.
      public.fn_estado_cobro(t.estado, pg.id_pago is not null, r.id_reembolso is not null)
        as estado_cobro
    from public.turno t
    join public.paciente pa on pa.id_paciente = t.id_paciente
    join public.usuario u on u.id_usuario = t.id_profesional
    join public.servicio s on s.id_servicio = t.id_servicio
    left join public.pago pg on pg.id_turno = t.id_turno
    left join public.reembolso r on r.id_pago = pg.id_pago
    where (p_id_profesional is null or t.id_profesional = p_id_profesional)
      and (p_id_servicio is null or t.id_servicio = p_id_servicio)
      and (p_desde is null or t.fecha >= p_desde)
      and (p_hasta is null or t.fecha <= p_hasta)
      and (v_estado is null or t.estado = v_estado)
      -- Paciente: ninguna palabra puede quedar sin coincidir (AND entre palabras).
      -- strpos en vez de ilike: así un "%" o "_" escrito se busca literal.
      and (
        v_palabras is null
        or not exists (
          select 1
          from unnest(v_palabras) as w
          where not (
            (w ~ '^\d+$' and pa.dni_paciente::text like w || '%')
            or strpos(lower(pa.nombre_paciente), w) > 0
            or strpos(lower(pa.apellido_paciente), w) > 0
          )
        )
      )
  ),
  coincidencias as (
    select * from base b where v_cobro is null or b.estado_cobro = v_cobro
  ),
  pagina as (
    select *
    from coincidencias c
    -- Orden cronológico; el resto desempata para que las páginas no se mezclen.
    order by c.fecha, c.hora_inicio, c.apellido_paciente, c.nombre_paciente, c.id_turno
    limit v_por_pagina
    offset (v_pagina - 1) * v_por_pagina
  )
  select jsonb_build_object(
    'total', (select count(*) from coincidencias),
    'pagina', v_pagina,
    'por_pagina', v_por_pagina,
    'turnos', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id_turno', p.id_turno,
            'fecha', p.fecha,
            'hora_inicio', to_char(p.hora_inicio, 'HH24:MI'),
            'hora_fin', to_char(p.hora_fin, 'HH24:MI'),
            'estado', p.estado,
            'motivo_cancelacion', p.motivo_cancelacion,
            'id_paciente', p.id_paciente,
            'nombre_paciente', p.nombre_paciente,
            'apellido_paciente', p.apellido_paciente,
            'dni_paciente', p.dni_paciente,
            'id_profesional', p.id_profesional,
            'nombre_profesional', p.nombre_usuario,
            'apellido_profesional', p.apellido_usuario,
            'id_servicio', p.id_servicio,
            'nombre_servicio', p.nombre_servicio,
            'estado_cobro', p.estado_cobro
          )
          order by p.fecha, p.hora_inicio, p.apellido_paciente, p.nombre_paciente, p.id_turno
        )
        from pagina p
      ),
      '[]'::jsonb
    )
  )
  into v_resultado;

  return v_resultado;
end;
$$;

-- ============ Pago de un turno (023 + estado de cobro en el turno) ============
create or replace function public.fn_obtener_pago(p_id_turno uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas']);

  select jsonb_build_object(
    'turno', jsonb_build_object(
      'id_turno', t.id_turno,
      'estado', t.estado,
      'fecha', t.fecha,
      'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
      'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
      'id_paciente', pa.id_paciente,
      'nombre_paciente', pa.nombre_paciente,
      'apellido_paciente', pa.apellido_paciente,
      'dni_paciente', pa.dni_paciente,
      'nombre_profesional', u.nombre_usuario,
      'apellido_profesional', u.apellido_usuario,
      'nombre_servicio', s.nombre_servicio,
      'precio_servicio', s.precio_servicio, -- sugerencia; el pago guarda su propio importe
      'id_obra_social', t.id_obra_social,
      'cobertura', coalesce(o.nombre_obra_social, 'Particular'),
      'numero_afiliado', t.numero_afiliado,
      -- HU-17: estado de cobro del turno (también para el comprobante, HU-35).
      'estado_cobro', public.fn_estado_cobro(
        t.estado, p.id_pago is not null, r.id_reembolso is not null
      )
    ),
    -- Un turno con pago (reembolsado o no) ya no es cobrable: un pago por turno.
    'cobrable', (t.estado in ('confirmado', 'atendido') and p.id_pago is null),
    'reembolsable', (p.id_pago is not null and r.id_reembolso is null),
    'pago', case when p.id_pago is null then null else jsonb_build_object(
      'id_pago', p.id_pago,
      'estado', case when r.id_reembolso is null then 'Pagado' else 'Reembolsado' end,
      'importe_base', p.importe_base,
      'descuento', p.descuento,
      'importe_final', p.importe_final,
      'medio_pago', p.medio_pago,
      'registrado_en', p.registrado_en,
      'registrado_por', ur.nombre_usuario || ' ' || ur.apellido_usuario,
      'corregido_en', p.corregido_en
    ) end,
    'reembolso', case when r.id_reembolso is null then null else jsonb_build_object(
      'id_reembolso', r.id_reembolso,
      'importe', r.importe,
      'medio_devolucion', r.medio_devolucion,
      'motivo', r.motivo,
      'detalle', r.detalle,
      'registrado_en', r.registrado_en,
      'registrado_por', urr.nombre_usuario || ' ' || urr.apellido_usuario
    ) end,
    'correcciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'motivo', c.motivo,
        'importe_base_anterior', c.importe_base_anterior,
        'descuento_anterior', c.descuento_anterior,
        'importe_final_anterior', c.importe_final_anterior,
        'medio_pago_anterior', c.medio_pago_anterior,
        'importe_base_nuevo', c.importe_base_nuevo,
        'descuento_nuevo', c.descuento_nuevo,
        'importe_final_nuevo', c.importe_final_nuevo,
        'medio_pago_nuevo', c.medio_pago_nuevo,
        'corregido_en', c.corregido_en,
        'corregido_por', uc.nombre_usuario || ' ' || uc.apellido_usuario
      ) order by c.corregido_en desc)
      from public.pago_correccion c
      join public.usuario uc on uc.id_usuario = c.corregido_por
      where c.id_pago = p.id_pago
    ), '[]'::jsonb)
  )
  into v_resultado
  from public.turno t
  join public.paciente pa on pa.id_paciente = t.id_paciente
  join public.usuario u on u.id_usuario = t.id_profesional
  join public.servicio s on s.id_servicio = t.id_servicio
  left join public.obra_social o on o.id_obra_social = t.id_obra_social
  left join public.pago p on p.id_turno = t.id_turno
  left join public.usuario ur on ur.id_usuario = p.registrado_por
  left join public.reembolso r on r.id_pago = p.id_pago
  left join public.usuario urr on urr.id_usuario = r.registrado_por
  where t.id_turno = p_id_turno;

  if v_resultado is null then
    raise exception 'El turno no existe';
  end if;

  return v_resultado;
end;
$$;

-- ============ Permisos ============
revoke all on function public.fn_obtener_turno(uuid) from public, anon;
revoke all on function public.fn_consultar_agenda_profesional(uuid, date) from public, anon;
revoke all on function public.fn_buscar_turnos(text, uuid, uuid, date, date, text, integer, text)
  from public, anon;
revoke all on function public.fn_obtener_pago(uuid) from public, anon;

grant execute on function public.fn_obtener_turno(uuid) to authenticated;
grant execute on function public.fn_consultar_agenda_profesional(uuid, date) to authenticated;
grant execute on function public.fn_buscar_turnos(text, uuid, uuid, date, date, text, integer, text)
  to authenticated;
grant execute on function public.fn_obtener_pago(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
