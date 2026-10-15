-- HU-20. Registrar la prioridad o urgencia de un turno. Issue #20.
--
-- La prioridad es una marca visual para la operación (Normal / Alta / Urgente). No es un
-- dato clínico, no cambia el orden por horario ni la disponibilidad y no habilita sobreturnos.
--
-- Cambios:
--   * turno.prioridad ('normal' | 'alta' | 'urgente', default 'normal': los turnos existentes
--     quedan en Normal) + turno.prioridad_nota (opcional, <= 200) + quién / cuándo la cambió.
--   * fn_otorgar_turno suma p_prioridad (default 'normal') con drop + create (copia de 022).
--   * fn_cambiar_prioridad_turno (nueva): Recepción y Gerente, solo turnos confirmados que
--     todavía no empezaron (hora de Argentina). Nota opcional.
--   * fn_obtener_turno (copia de 025), fn_consultar_agenda_profesional (copia de 014) y
--     fn_buscar_turnos (copia de 016, + filtro p_prioridad con drop + create) devuelven la
--     prioridad.
--   * fn_turno_repetir_confirmar (copia de 018): los turnos nuevos copian la prioridad.
--   * Reprogramar (HU-10C) solo toca fecha y horas: la prioridad se conserva sola.
begin;

-- ============ Columnas ============
alter table public.turno
  add column prioridad text not null default 'normal',
  add column prioridad_nota text,
  add column prioridad_actualizada_en timestamptz,
  add column prioridad_actualizada_por uuid references public.usuario (id_usuario);

alter table public.turno
  add constraint turno_prioridad_valida
    check (prioridad in ('normal', 'alta', 'urgente'));

alter table public.turno
  add constraint turno_prioridad_nota_largo
    check (prioridad_nota is null or char_length(prioridad_nota) <= 200);

-- ============ Otorgar: con prioridad (HU-06 / HU-28, paso de confirmar) ============
drop function if exists public.fn_otorgar_turno(uuid, uuid, uuid, date, time, uuid);

create function public.fn_otorgar_turno(
  p_id_paciente uuid,
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_hora time without time zone,
  p_id_obra_social uuid default null::uuid,
  p_prioridad text default 'normal' -- HU-20
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
  -- HU-20: si no se elige, queda Normal.
  v_prioridad text := coalesce(lower(nullif(trim(p_prioridad), '')), 'normal');
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

  if v_prioridad not in ('normal', 'alta', 'urgente') then
    raise exception 'La prioridad no es válida';
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

    -- Una obra inactiva se conserva en el paciente, pero no se puede usar para turnos nuevos
    if not exists (
      select 1 from public.obra_social o
      where o.id_obra_social = p_id_obra_social and o.activo = true
    ) then
      raise exception 'La obra social elegida está inactiva y no se puede usar como cobertura';
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
      numero_afiliado,
      prioridad
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
      v_afiliado,
      v_prioridad
    )
    returning id_turno into v_id;
  exception when exclusion_violation then
    -- Última defensa: la restricción EXCLUDE detectó un solapamiento.
    raise exception 'El horario seleccionado ya no está disponible';
  end;

  return public.fn_obtener_turno(v_id);
end;
$$;

-- ============ Cambiar la prioridad desde el detalle del turno ============
create or replace function public.fn_cambiar_prioridad_turno(
  p_id_turno uuid,
  p_prioridad text,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prioridad text := lower(nullif(trim(p_prioridad), ''));
  v_nota text := nullif(trim(p_nota), '');
  v_ahora timestamp := timezone('America/Argentina/Buenos_Aires', now());
  v_turno public.turno;
begin
  perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas']);

  if p_id_turno is null or v_prioridad is null then
    raise exception 'Elegí la prioridad';
  end if;

  if v_prioridad not in ('normal', 'alta', 'urgente') then
    raise exception 'La prioridad no es válida';
  end if;

  if char_length(v_nota) > 200 then
    raise exception 'La nota no puede superar los 200 caracteres';
  end if;

  -- Bloquea la fila: si a la vez lo cancelan o lo atienden, se ve el estado nuevo.
  select * into v_turno
  from public.turno t
  where t.id_turno = p_id_turno
  for update;

  if v_turno.id_turno is null then
    raise exception 'El turno no existe';
  end if;

  if v_turno.estado <> 'confirmado' then
    raise exception 'Solo se puede cambiar la prioridad de un turno confirmado';
  end if;

  if v_turno.fecha + v_turno.hora_inicio <= v_ahora then
    raise exception 'El turno ya pasó; no se puede cambiar la prioridad';
  end if;

  update public.turno
  set prioridad = v_prioridad,
      prioridad_nota = v_nota,
      prioridad_actualizada_en = now(),
      prioridad_actualizada_por = auth.uid()
  where id_turno = p_id_turno;

  return public.fn_obtener_turno(p_id_turno);
end;
$$;

-- ============ Detalle del turno: suma la prioridad ============
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
    -- HU-20: prioridad (marca visual). Editable si está confirmado y todavía no empezó.
    'prioridad', t.prioridad,
    'prioridad_nota', t.prioridad_nota,
    'prioridad_editable', (t.estado = 'confirmado' and t.fecha + t.hora_inicio > v_ahora),
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
    -- HU-24A / HU-38: la orden médica va acá adentro, así Recepción tampoco la recibe.
    'atencion', case
      when a.id_atencion is not null and a.id_profesional = auth.uid() then
        jsonb_build_object(
          'fecha_atencion', a.fecha_atencion,
          'observaciones', a.observaciones,
          'motivo_consulta', a.motivo_consulta,
          'orden_medica', a.orden_medica,
          'orden_sesiones', a.orden_sesiones,
          -- HU-38: datos automáticos de la orden (leídos de la base, no del front).
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
  left join public.profesional pr on pr.id_usuario = t.id_profesional
  left join public.obra_social o on o.id_obra_social = t.id_obra_social
  left join public.atencion a on a.id_turno = t.id_turno
  where t.id_turno = p_id_turno;

  if v_resultado is null then
    raise exception 'El turno no existe';
  end if;

  return v_resultado;
end;
$$;

-- ============ Agenda (Recepción y Profesional): suma la prioridad ============
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
          'prioridad', t.prioridad, -- HU-20
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

-- ============ Listado de turnos (HU-09): prioridad + filtro ============
drop function if exists public.fn_buscar_turnos(text, uuid, uuid, date, date, text, integer);

create function public.fn_buscar_turnos(
  p_texto text default null,
  p_id_profesional uuid default null,
  p_id_servicio uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_estado text default null,
  p_pagina integer default 1,
  p_prioridad text default null -- HU-20
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
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_prioridad text := lower(nullif(trim(coalesce(p_prioridad, '')), ''));
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

  -- HU-20: filtro de prioridad (Todas = sin filtro).
  if v_prioridad = 'todas' then
    v_prioridad := null;
  end if;

  if v_prioridad is not null and v_prioridad not in ('normal', 'alta', 'urgente') then
    raise exception 'La prioridad no es válida';
  end if;

  if char_length(v_texto) > 100 then
    raise exception 'La búsqueda no puede superar los 100 caracteres';
  end if;

  if v_texto <> '' then
    v_palabras := regexp_split_to_array(lower(v_texto), '\s+');
  end if;

  -- "coincidencias" se usa dos veces: para el total y para armar la página.
  with coincidencias as (
    select
      t.id_turno,
      t.fecha,
      t.hora_inicio,
      t.hora_fin,
      t.estado,
      t.motivo_cancelacion,
      t.prioridad,
      pa.id_paciente,
      pa.nombre_paciente,
      pa.apellido_paciente,
      pa.dni_paciente,
      t.id_profesional,
      u.nombre_usuario,
      u.apellido_usuario,
      t.id_servicio,
      s.nombre_servicio
    from public.turno t
    join public.paciente pa on pa.id_paciente = t.id_paciente
    join public.usuario u on u.id_usuario = t.id_profesional
    join public.servicio s on s.id_servicio = t.id_servicio
    where (p_id_profesional is null or t.id_profesional = p_id_profesional)
      and (p_id_servicio is null or t.id_servicio = p_id_servicio)
      and (p_desde is null or t.fecha >= p_desde)
      and (p_hasta is null or t.fecha <= p_hasta)
      and (v_estado is null or t.estado = v_estado)
      and (v_prioridad is null or t.prioridad = v_prioridad)
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
            'prioridad', p.prioridad,
            'id_paciente', p.id_paciente,
            'nombre_paciente', p.nombre_paciente,
            'apellido_paciente', p.apellido_paciente,
            'dni_paciente', p.dni_paciente,
            'id_profesional', p.id_profesional,
            'nombre_profesional', p.nombre_usuario,
            'apellido_profesional', p.apellido_usuario,
            'id_servicio', p.id_servicio,
            'nombre_servicio', p.nombre_servicio
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

-- ============ Repetir (HU-25): los turnos nuevos copian la prioridad ============
create or replace function public.fn_turno_repetir_confirmar(
  p_id_turno uuid,
  p_semanas integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turno := public.fn_turno_repetible(p_id_turno, p_semanas);
  v_actual public.turno;
  v_lock record;
  v_semana integer;
  v_fecha date;
  v_eval jsonb;
  v_id_serie uuid;
  v_id uuid;
  v_creados jsonb := '[]'::jsonb;
  v_omitidos jsonb := '[]'::jsonb;
begin
  -- Mismo lock que otorgar / cancelar / reprogramar (profesional + día), para el día del
  -- turno original y para cada fecha nueva. Se toman todos juntos y ordenados por el
  -- valor del hash (igual que reprogramar), así nadie queda esperando en orden cruzado.
  for v_lock in
    select distinct hashtextextended(v_turno.id_profesional::text || d::text, 0) as clave
    from (
      select v_turno.fecha + 7 * s as d from generate_series(0, p_semanas) s
    ) dias
    order by clave
  loop
    perform pg_advisory_xact_lock(v_lock.clave);
  end loop;

  -- Con los locks tomados, se relee el turno: si mientras esperábamos lo cancelaron o
  -- lo reprogramaron, la serie ya no corresponde.
  select * into v_actual from public.turno t where t.id_turno = p_id_turno for update;

  if v_actual.estado <> 'confirmado' then
    raise exception 'Solo se puede repetir un turno confirmado';
  end if;

  if v_actual.fecha <> v_turno.fecha or v_actual.hora_inicio <> v_turno.hora_inicio then
    raise exception 'El turno cambió mientras armabas la serie; volvé a intentarlo';
  end if;

  v_id_serie := v_actual.id_serie;

  for v_semana in 1..p_semanas loop
    v_fecha := v_actual.fecha + 7 * v_semana;

    -- Revalidación en el momento de crear (el preview pudo quedar viejo).
    v_eval := public.fn_evaluar_repeticion(
      v_actual.id_profesional, v_actual.id_servicio, v_fecha, v_actual.hora_inicio
    );

    if not (v_eval ->> 'disponible')::boolean then
      v_omitidos := v_omitidos || jsonb_build_array(
        jsonb_build_object('fecha', v_fecha, 'motivo', v_eval ->> 'motivo')
      );
      continue;
    end if;

    -- La serie se crea con el primer turno nuevo (si no se crea ninguno, no hay serie).
    -- Si el turno ya era parte de una serie, se suma a esa.
    if v_id_serie is null then
      insert into public.serie_turno (
        id_turno_origen, id_paciente, id_profesional, id_servicio, creada_por
      )
      values (
        v_actual.id_turno, v_actual.id_paciente, v_actual.id_profesional,
        v_actual.id_servicio, auth.uid()
      )
      returning id_serie into v_id_serie;

      update public.turno set id_serie = v_id_serie where id_turno = v_actual.id_turno;
    end if;

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
        numero_afiliado,
        id_serie,
        prioridad,
        prioridad_nota
      )
      values (
        v_actual.id_profesional,
        v_actual.id_servicio,
        v_actual.id_paciente,
        v_fecha,
        v_actual.hora_inicio,
        (v_eval ->> 'hora_fin')::time,
        'confirmado',
        v_actual.id_obra_social, -- misma cobertura que el turno original
        v_actual.numero_afiliado,
        v_id_serie,
        v_actual.prioridad, -- HU-20: los turnos nuevos copian la prioridad del original
        v_actual.prioridad_nota
      )
      returning id_turno into v_id;

      v_creados := v_creados || jsonb_build_array(
        jsonb_build_object('id_turno', v_id, 'fecha', v_fecha)
      );
    exception when exclusion_violation then
      -- Última defensa (EXCLUDE): se omite esta fecha, el resto sigue.
      v_omitidos := v_omitidos || jsonb_build_array(
        jsonb_build_object('fecha', v_fecha, 'motivo', 'Horario ocupado')
      );
    end;
  end loop;

  return jsonb_build_object(
    'id_serie', v_id_serie,
    'creados', v_creados,
    'omitidos', v_omitidos
  );
end;
$$;

-- ============ Permisos ============
revoke all on function public.fn_otorgar_turno(uuid, uuid, uuid, date, time, uuid, text) from public, anon;
revoke all on function public.fn_cambiar_prioridad_turno(uuid, text, text) from public, anon;
revoke all on function public.fn_obtener_turno(uuid) from public, anon;
revoke all on function public.fn_consultar_agenda_profesional(uuid, date) from public, anon;
revoke all on function public.fn_buscar_turnos(text, uuid, uuid, date, date, text, integer, text) from public, anon;
revoke all on function public.fn_turno_repetir_confirmar(uuid, integer) from public, anon;

grant execute on function public.fn_otorgar_turno(uuid, uuid, uuid, date, time, uuid, text) to authenticated;
grant execute on function public.fn_cambiar_prioridad_turno(uuid, text, text) to authenticated;
grant execute on function public.fn_obtener_turno(uuid) to authenticated;
grant execute on function public.fn_consultar_agenda_profesional(uuid, date) to authenticated;
grant execute on function public.fn_buscar_turnos(text, uuid, uuid, date, date, text, integer, text) to authenticated;
grant execute on function public.fn_turno_repetir_confirmar(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
