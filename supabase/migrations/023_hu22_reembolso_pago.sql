-- HU-22. Registrar el reembolso de un pago (Recepción y Gerente).
-- HU-17: el pago queda en estado Reembolsado.
--
-- Se apoya en HU-14 (017_hu14_pagos.sql):
--
--   * Tabla nueva reembolso: un solo reembolso por pago (unique id_pago) y TOTAL
--     (importe = importe_final del pago). Reembolsos parciales: fuera de alcance.
--   * El estado se DERIVA: con fila en reembolso = 'Reembolsado'; si no, 'Pagado'.
--     No hay columna estado en pago.
--   * El estado del turno NO cambia al reembolsar.
--   * Medio de devolución: la misma lista cerrada que el pago; null = el medio del pago.
--   * Motivos: turno_cancelado, pedido_paciente, otro (con Otro el detalle es obligatorio).
--   * Un pago reembolsado no se corrige (fn_corregir_pago lo rechaza).
--   * La devolución en billeteras virtuales (HU-21) se hace fuera del sistema.
--
-- Modifica fn_obtener_pago (suma reembolsable, pago.estado y reembolso), fn_corregir_pago
-- (rechaza reembolsados) y fn_listar_pagos (filtro p_reembolso + estado_pago y reembolso).
-- fn_listar_pagos cambia de firma: se hace drop de la de 4 parámetros (no dejar dos versiones).
-- Tabla con RLS y sin grants: el único acceso es por estas fn_* (security definer).
begin;

-- ============ Tabla ============

create table if not exists public.reembolso (
  id_reembolso uuid primary key default gen_random_uuid(),
  id_pago uuid not null references public.pago (id_pago),
  importe numeric(12, 2) not null, -- copiado de pago.importe_final (reembolso total)
  medio_devolucion text not null,
  motivo text not null,
  detalle text, -- null = sin detalle
  registrado_en timestamptz not null default now(),
  registrado_por uuid not null references public.usuario (id_usuario),
  constraint reembolso_un_reembolso_por_pago unique (id_pago),
  constraint reembolso_importe_valido check (importe > 0),
  constraint reembolso_medio_valido
    check (medio_devolucion in ('efectivo', 'transferencia', 'debito', 'credito')),
  constraint reembolso_motivo_valido
    check (motivo in ('turno_cancelado', 'pedido_paciente', 'otro')),
  constraint reembolso_detalle_valido
    check (detalle is null or char_length(detalle) between 1 and 200),
  constraint reembolso_otro_con_detalle
    check (motivo <> 'otro' or detalle is not null)
);

create index if not exists idx_reembolso_registrado_en on public.reembolso (registrado_en);

alter table public.reembolso enable row level security;
revoke all on public.reembolso from public, anon, authenticated;

-- ============ Consultar el pago de un turno (HU-14 + HU-22) ============
-- Suma: 'reembolsable' (hay pago y todavía no se reembolsó), pago.estado y 'reembolso'.
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
      'numero_afiliado', t.numero_afiliado
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

-- ============ Registrar el reembolso (HU-22) ============
-- Reembolso total del pago del turno. Devuelve lo mismo que fn_obtener_pago.
create or replace function public.fn_registrar_reembolso(
  p_id_turno uuid,
  p_motivo text,
  p_detalle text default null,
  p_medio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago public.pago;
  v_motivo text := nullif(trim(p_motivo), '');
  v_detalle text := nullif(trim(p_detalle), '');
  v_medio text;
begin
  perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas']);

  if p_id_turno is null then
    raise exception 'Faltan campos';
  end if;

  -- Bloquea el pago: un doble envío (o dos pestañas) se atiende de a uno,
  -- y el segundo ya ve el reembolso del primero.
  select p.* into v_pago
  from public.pago p
  where p.id_turno = p_id_turno
  for update;

  if not found then
    raise exception 'Este turno todavía no tiene un pago registrado';
  end if;

  if exists (select 1 from public.reembolso r where r.id_pago = v_pago.id_pago) then
    raise exception 'Este pago ya fue reembolsado';
  end if;

  if v_motivo is null or v_motivo not in ('turno_cancelado', 'pedido_paciente', 'otro') then
    raise exception 'Elegí el motivo del reembolso';
  end if;

  if char_length(v_detalle) > 200 then
    raise exception 'El detalle no puede superar los 200 caracteres';
  end if;

  if v_motivo = 'otro' and v_detalle is null then
    raise exception 'Indicá el detalle del reembolso cuando el motivo es Otro';
  end if;

  -- Sin medio: se devuelve por el mismo medio con que se cobró.
  v_medio := coalesce(nullif(trim(p_medio), ''), v_pago.medio_pago);
  if v_medio not in ('efectivo', 'transferencia', 'debito', 'credito') then
    raise exception 'Elegí un medio de devolución válido';
  end if;

  begin
    insert into public.reembolso (
      id_pago, importe, medio_devolucion, motivo, detalle, registrado_por
    )
    values (
      v_pago.id_pago, v_pago.importe_final, v_medio, v_motivo, v_detalle, auth.uid()
    );
  exception when unique_violation then
    -- Última defensa (reembolso_un_reembolso_por_pago).
    raise exception 'Este pago ya fue reembolsado';
  end;

  return public.fn_obtener_pago(p_id_turno);
end;
$$;

-- ============ Corregir el pago (HU-14 + HU-22) ============
-- Igual que en 017, pero un pago reembolsado ya no se corrige.
create or replace function public.fn_corregir_pago(
  p_id_turno uuid,
  p_importe_base numeric,
  p_descuento numeric,
  p_medio text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(trim(p_motivo), '');
  v_pago public.pago;
  v_con_obra boolean;
  v_final numeric;
begin
  perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas']);

  if p_id_turno is null then
    raise exception 'Faltan campos';
  end if;

  select p.* into v_pago
  from public.pago p
  where p.id_turno = p_id_turno
  for update;

  if not found then
    raise exception 'Este turno todavía no tiene un pago registrado';
  end if;

  if exists (select 1 from public.reembolso r where r.id_pago = v_pago.id_pago) then
    raise exception 'Un pago reembolsado no se puede corregir';
  end if;

  if v_motivo is null then
    raise exception 'Indicá el motivo de la corrección';
  end if;

  if char_length(v_motivo) > 200 then
    raise exception 'El motivo no puede superar los 200 caracteres';
  end if;

  select t.id_obra_social is not null into v_con_obra
  from public.turno t
  where t.id_turno = p_id_turno;

  v_final := public.fn_validar_importes_pago(p_importe_base, p_descuento, p_medio, v_con_obra);

  if p_importe_base = v_pago.importe_base
    and coalesce(p_descuento, 0) = v_pago.descuento
    and p_medio = v_pago.medio_pago then
    raise exception 'No hay cambios para guardar';
  end if;

  insert into public.pago_correccion (
    id_pago, motivo,
    importe_base_anterior, descuento_anterior, importe_final_anterior, medio_pago_anterior,
    importe_base_nuevo, descuento_nuevo, importe_final_nuevo, medio_pago_nuevo,
    corregido_por
  )
  values (
    v_pago.id_pago, v_motivo,
    v_pago.importe_base, v_pago.descuento, v_pago.importe_final, v_pago.medio_pago,
    p_importe_base, coalesce(p_descuento, 0), v_final, p_medio,
    auth.uid()
  );

  update public.pago
  set importe_base = p_importe_base,
      descuento = coalesce(p_descuento, 0),
      importe_final = v_final,
      medio_pago = p_medio,
      corregido_en = now()
  where id_pago = v_pago.id_pago;

  return public.fn_obtener_pago(p_id_turno);
end;
$$;

-- ============ Listado de pagos (HU-14 + HU-22) ============
-- Suma el filtro p_reembolso: null = todos, 'con' = reembolsados, 'sin' = no reembolsados.
-- Cada pago suma estado_pago y reembolso (importe, medio, motivo, fecha).
drop function if exists public.fn_listar_pagos(text, date, date, integer);

create or replace function public.fn_listar_pagos(
  p_texto text default null,
  p_desde date default null,
  p_hasta date default null,
  p_pagina integer default 1,
  p_reembolso text default null
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
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_reembolso text := nullif(trim(p_reembolso), '');
  v_resultado jsonb;
begin
  perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas']);

  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then
    raise exception 'La fecha Hasta no puede ser anterior a Desde';
  end if;

  if char_length(v_texto) > 100 then
    raise exception 'La búsqueda no puede superar los 100 caracteres';
  end if;

  if v_reembolso is not null and v_reembolso not in ('con', 'sin') then
    raise exception 'El filtro de reembolso no es válido';
  end if;

  if v_texto <> '' then
    v_palabras := regexp_split_to_array(lower(v_texto), '\s+');
  end if;

  with coincidencias as (
    select
      p.id_pago,
      p.id_turno,
      p.importe_base,
      p.descuento,
      p.importe_final,
      p.medio_pago,
      p.registrado_en,
      p.corregido_en,
      t.fecha,
      t.hora_inicio,
      t.estado,
      pa.nombre_paciente,
      pa.apellido_paciente,
      pa.dni_paciente,
      s.nombre_servicio,
      r.id_reembolso,
      r.importe as importe_reembolso,
      r.medio_devolucion,
      r.motivo as motivo_reembolso,
      r.registrado_en as reembolsado_en
    from public.pago p
    join public.turno t on t.id_turno = p.id_turno
    join public.paciente pa on pa.id_paciente = p.id_paciente
    join public.servicio s on s.id_servicio = t.id_servicio
    left join public.reembolso r on r.id_pago = p.id_pago
    where (p_desde is null
        or (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date >= p_desde)
      and (p_hasta is null
        or (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date <= p_hasta)
      and (v_reembolso is null
        or (v_reembolso = 'con' and r.id_reembolso is not null)
        or (v_reembolso = 'sin' and r.id_reembolso is null))
      -- Paciente: cada palabra tiene que coincidir con nombre, apellido o comienzo del DNI.
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
    order by c.registrado_en desc, c.id_pago
    limit v_por_pagina
    offset (v_pagina - 1) * v_por_pagina
  )
  select jsonb_build_object(
    'total', (select count(*) from coincidencias),
    'pagina', v_pagina,
    'por_pagina', v_por_pagina,
    'pagos', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id_pago', g.id_pago,
            'id_turno', g.id_turno,
            'nombre_paciente', g.nombre_paciente,
            'apellido_paciente', g.apellido_paciente,
            'dni_paciente', g.dni_paciente,
            'fecha_turno', g.fecha,
            'hora_turno', to_char(g.hora_inicio, 'HH24:MI'),
            'estado_turno', g.estado,
            'nombre_servicio', g.nombre_servicio,
            'importe_base', g.importe_base,
            'descuento', g.descuento,
            'importe_final', g.importe_final,
            'medio_pago', g.medio_pago,
            'registrado_en', g.registrado_en,
            'corregido', g.corregido_en is not null,
            'estado_pago', case when g.id_reembolso is null then 'Pagado' else 'Reembolsado' end,
            'reembolso', case when g.id_reembolso is null then null else jsonb_build_object(
              'importe', g.importe_reembolso,
              'medio_devolucion', g.medio_devolucion,
              'motivo', g.motivo_reembolso,
              'registrado_en', g.reembolsado_en
            ) end
          )
          order by g.registrado_en desc, g.id_pago
        )
        from pagina g
      ),
      '[]'::jsonb
    )
  )
  into v_resultado;

  return v_resultado;
end;
$$;

-- ============ Permisos ============
revoke all on function public.fn_obtener_pago(uuid) from public, anon;
revoke all on function public.fn_registrar_reembolso(uuid, text, text, text) from public, anon;
revoke all on function public.fn_corregir_pago(uuid, numeric, numeric, text, text) from public, anon;
revoke all on function public.fn_listar_pagos(text, date, date, integer, text) from public, anon;

grant execute on function public.fn_obtener_pago(uuid) to authenticated;
grant execute on function public.fn_registrar_reembolso(uuid, text, text, text) to authenticated;
grant execute on function public.fn_corregir_pago(uuid, numeric, numeric, text, text) to authenticated;
grant execute on function public.fn_listar_pagos(text, date, date, integer, text) to authenticated;

notify pgrst, 'reload schema';

commit;
