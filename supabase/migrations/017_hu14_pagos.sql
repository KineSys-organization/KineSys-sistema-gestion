-- HU-14. Registrar y consultar pagos de turnos (Recepción y Gerente).
--
-- Un pago es dinero ya recibido por un turno. Se registra DESPUÉS de reservar:
-- no cambia el flujo de otorgar ni el estado del turno.
--
--   * Un solo pago por turno (unique): un doble envío no duplica.
--   * Se cobran turnos 'confirmado' o 'atendido'. Si después el turno se cancela,
--     se marca ausente o se reprograma, el pago se conserva igual (está en otra tabla,
--     atado al mismo id_turno). La devolución es HU-22.
--   * Importes en pesos, hasta dos decimales: importe_final = importe_base - descuento > 0.
--     El descuento es manual y solo si el turno tiene cobertura de obra social.
--   * Medio: efectivo, transferencia, debito o credito (lista cerrada).
--   * Las correcciones modifican el MISMO pago y guardan el historial (pago_correccion).
--
-- No modifica tablas ni funciones existentes. Tablas con RLS y sin grants:
-- el único acceso es por estas fn_* (security definer, rol con fn_exigir_rol).
begin;

-- ============ Tablas ============

create table public.pago (
  id_pago uuid primary key default gen_random_uuid(),
  id_turno uuid not null references public.turno (id_turno),
  id_paciente uuid not null references public.paciente (id_paciente), -- copiado del turno
  importe_base numeric(12, 2) not null,
  descuento numeric(12, 2) not null default 0,
  importe_final numeric(12, 2) not null,
  medio_pago text not null,
  registrado_en timestamptz not null default now(),
  registrado_por uuid not null references public.usuario (id_usuario),
  corregido_en timestamptz, -- null = nunca se corrigió
  constraint pago_un_pago_por_turno unique (id_turno),
  constraint pago_medio_valido
    check (medio_pago in ('efectivo', 'transferencia', 'debito', 'credito')),
  constraint pago_importes_validos
    check (
      importe_base > 0
      and descuento >= 0
      and importe_final > 0
      and importe_final = importe_base - descuento
    )
);

create index idx_pago_registrado_en on public.pago (registrado_en);
create index idx_pago_paciente on public.pago (id_paciente);

-- Historial de correcciones: valores anteriores y nuevos, motivo, quién y cuándo.
create table public.pago_correccion (
  id_correccion uuid primary key default gen_random_uuid(),
  id_pago uuid not null references public.pago (id_pago),
  motivo text not null,
  importe_base_anterior numeric(12, 2) not null,
  descuento_anterior numeric(12, 2) not null,
  importe_final_anterior numeric(12, 2) not null,
  medio_pago_anterior text not null,
  importe_base_nuevo numeric(12, 2) not null,
  descuento_nuevo numeric(12, 2) not null,
  importe_final_nuevo numeric(12, 2) not null,
  medio_pago_nuevo text not null,
  corregido_en timestamptz not null default now(),
  corregido_por uuid not null references public.usuario (id_usuario),
  constraint pago_correccion_motivo_valido
    check (char_length(trim(motivo)) between 1 and 200)
);

create index idx_pago_correccion_pago on public.pago_correccion (id_pago, corregido_en);

alter table public.pago enable row level security;
alter table public.pago_correccion enable row level security;
revoke all on public.pago from public, anon, authenticated;
revoke all on public.pago_correccion from public, anon, authenticated;

-- ============ Helper interno: validar importes y medio ============
-- Las mismas reglas para registrar y para corregir. Devuelve el importe final.
create or replace function public.fn_validar_importes_pago(
  p_importe_base numeric,
  p_descuento numeric,
  p_medio text,
  p_con_obra_social boolean
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_descuento numeric := coalesce(p_descuento, 0);
begin
  if p_importe_base is null then
    raise exception 'Ingresá el importe base';
  end if;

  if p_importe_base <= 0 then
    raise exception 'El importe base debe ser mayor que cero';
  end if;

  if p_importe_base > 99999999.99 then
    raise exception 'El importe base es demasiado alto';
  end if;

  if p_importe_base <> round(p_importe_base, 2) or v_descuento <> round(v_descuento, 2) then
    raise exception 'Los importes admiten hasta dos decimales';
  end if;

  if v_descuento < 0 then
    raise exception 'El descuento no puede ser negativo';
  end if;

  if v_descuento > 0 and not coalesce(p_con_obra_social, false) then
    raise exception 'Solo se aplica descuento si el turno tiene cobertura de obra social';
  end if;

  if p_importe_base - v_descuento <= 0 then
    raise exception 'El descuento no puede dejar el importe final en cero o menos';
  end if;

  if p_medio is null or p_medio not in ('efectivo', 'transferencia', 'debito', 'credito') then
    raise exception 'Elegí un medio de pago válido';
  end if;

  return p_importe_base - v_descuento;
end;
$$;

revoke all on function public.fn_validar_importes_pago(numeric, numeric, text, boolean)
  from public, anon, authenticated;

-- ============ Consultar el pago de un turno ============
-- Datos del turno para cobrar (precio actual del servicio como sugerencia y cobertura),
-- si se puede cobrar, el pago (si existe) y su historial de correcciones.
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
    'cobrable', (t.estado in ('confirmado', 'atendido') and p.id_pago is null),
    'pago', case when p.id_pago is null then null else jsonb_build_object(
      'id_pago', p.id_pago,
      'importe_base', p.importe_base,
      'descuento', p.descuento,
      'importe_final', p.importe_final,
      'medio_pago', p.medio_pago,
      'registrado_en', p.registrado_en,
      'registrado_por', ur.nombre_usuario || ' ' || ur.apellido_usuario,
      'corregido_en', p.corregido_en
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
  where t.id_turno = p_id_turno;

  if v_resultado is null then
    raise exception 'El turno no existe';
  end if;

  return v_resultado;
end;
$$;

-- ============ Registrar el pago ============
create or replace function public.fn_registrar_pago(
  p_id_turno uuid,
  p_importe_base numeric,
  p_descuento numeric,
  p_medio text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno record;
  v_final numeric;
begin
  perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas']);

  if p_id_turno is null then
    raise exception 'Faltan campos';
  end if;

  -- Bloquea el turno: un doble envío (o dos pestañas) se atiende de a uno,
  -- y el segundo ya ve el pago del primero.
  select t.estado, t.id_paciente, t.id_obra_social
  into v_turno
  from public.turno t
  where t.id_turno = p_id_turno
  for update;

  if not found then
    raise exception 'El turno no existe';
  end if;

  if exists (select 1 from public.pago p where p.id_turno = p_id_turno) then
    raise exception 'Este turno ya tiene un pago registrado';
  end if;

  if v_turno.estado not in ('confirmado', 'atendido') then
    raise exception 'Solo se puede registrar el pago de un turno confirmado o atendido';
  end if;

  v_final := public.fn_validar_importes_pago(
    p_importe_base, p_descuento, p_medio, v_turno.id_obra_social is not null
  );

  begin
    insert into public.pago (
      id_turno, id_paciente, importe_base, descuento, importe_final, medio_pago, registrado_por
    )
    values (
      p_id_turno, v_turno.id_paciente, p_importe_base, coalesce(p_descuento, 0), v_final,
      p_medio, auth.uid()
    );
  exception when unique_violation then
    -- Última defensa (pago_un_pago_por_turno).
    raise exception 'Este turno ya tiene un pago registrado';
  end;

  return public.fn_obtener_pago(p_id_turno);
end;
$$;

-- ============ Corregir el pago (mismo registro, con historial) ============
-- Corregir no cobra ni devuelve dinero: solo deja bien registrado lo que se cobró.
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

-- ============ Listado de pagos ============
-- Filtros opcionales (AND): paciente (por palabras, como HU-09) y período de la FECHA DEL
-- PAGO (día de registro en hora de Argentina). De a 10, del más nuevo al más viejo.
-- Devuelve { total, pagina, por_pagina, pagos: [...] }.
create or replace function public.fn_listar_pagos(
  p_texto text default null,
  p_desde date default null,
  p_hasta date default null,
  p_pagina integer default 1
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
  v_resultado jsonb;
begin
  perform public.fn_exigir_rol(array['Gerente', 'Mesa de Entradas']);

  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then
    raise exception 'La fecha Hasta no puede ser anterior a Desde';
  end if;

  if char_length(v_texto) > 100 then
    raise exception 'La búsqueda no puede superar los 100 caracteres';
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
      s.nombre_servicio
    from public.pago p
    join public.turno t on t.id_turno = p.id_turno
    join public.paciente pa on pa.id_paciente = p.id_paciente
    join public.servicio s on s.id_servicio = t.id_servicio
    where (p_desde is null
        or (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date >= p_desde)
      and (p_hasta is null
        or (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date <= p_hasta)
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
            'corregido', g.corregido_en is not null
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
revoke all on function public.fn_registrar_pago(uuid, numeric, numeric, text) from public, anon;
revoke all on function public.fn_corregir_pago(uuid, numeric, numeric, text, text) from public, anon;
revoke all on function public.fn_listar_pagos(text, date, date, integer) from public, anon;

grant execute on function public.fn_obtener_pago(uuid) to authenticated;
grant execute on function public.fn_registrar_pago(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.fn_corregir_pago(uuid, numeric, numeric, text, text) to authenticated;
grant execute on function public.fn_listar_pagos(text, date, date, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
