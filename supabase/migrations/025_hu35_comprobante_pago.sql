-- HU-35. Comprobante de pago (Recepción y Gerente).
--
-- El comprobante es una constancia INTERNA de cobro, no una factura fiscal (AFIP/ARCA fuera
-- de alcance). No se guarda como archivo: se arma cada vez con los datos de la base.
--
--   * Un comprobante por pago: columna pago.numero_comprobante (secuencia, unique, not null).
--     Se asigna al registrar el pago (default de la columna: fn_registrar_pago no cambia)
--     y NO cambia aunque el pago se corrija (se corrige el mismo registro).
--   * Los pagos que ya existían se numeran acá, en orden de registrado_en.
--   * Decisión del equipo: la secuencia puede dejar saltos (p. ej. un doble envío que la base
--     rechaza consume un número). El número nunca se repite, nunca cambia y va en orden.
--   * Fecha de emisión = fecha y hora en que se registró el pago (fija al reimprimir).
--
-- Funciones:
--   * fn_obtener_comprobante(id_pago) (nueva): todos los datos del comprobante, con el
--     estado de cobro de la regla de HU-17 (fn_estado_cobro).
--   * fn_obtener_pago (024 + pago.numero_comprobante).
--   * fn_listar_pagos (023 + numero_comprobante y filtro p_numero_comprobante).
--     Cambia la firma: drop de la de 5 parámetros (no dejar dos versiones).
begin;

-- ============ Número de comprobante ============
create sequence if not exists public.pago_numero_comprobante_seq;

alter table public.pago add column if not exists numero_comprobante bigint;

-- Pagos existentes: 1, 2, 3... en el orden en que se registraron.
with orden as (
  select p.id_pago,
         row_number() over (order by p.registrado_en, p.id_pago) as n
  from public.pago p
  where p.numero_comprobante is null
)
update public.pago p
set numero_comprobante = o.n + coalesce((select max(numero_comprobante) from public.pago), 0)
from orden o
where o.id_pago = p.id_pago;

-- La secuencia sigue desde el último número asignado (sin pagos: arranca en 1).
select setval(
  'public.pago_numero_comprobante_seq',
  greatest(coalesce((select max(numero_comprobante) from public.pago), 0), 1),
  exists (select 1 from public.pago)
);

alter table public.pago
  alter column numero_comprobante set default nextval('public.pago_numero_comprobante_seq'),
  alter column numero_comprobante set not null;

alter table public.pago drop constraint if exists pago_numero_comprobante_unico;
alter table public.pago
  add constraint pago_numero_comprobante_unico unique (numero_comprobante);

alter table public.pago drop constraint if exists pago_numero_comprobante_valido;
alter table public.pago
  add constraint pago_numero_comprobante_valido check (numero_comprobante > 0);

alter sequence public.pago_numero_comprobante_seq owned by public.pago.numero_comprobante;

-- Solo la usan las fn_* (security definer), nunca el front.
revoke all on sequence public.pago_numero_comprobante_seq from public, anon, authenticated;

-- ============ Comprobante (nueva) ============
create or replace function public.fn_obtener_comprobante(p_id_pago uuid)
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
    'id_pago', p.id_pago,
    'id_turno', t.id_turno,
    'numero_comprobante', p.numero_comprobante,
    'emitido_en', p.registrado_en, -- fecha de emisión = registro del pago (fija)
    'registrado_por', ur.nombre_usuario || ' ' || ur.apellido_usuario,
    'corregido_en', p.corregido_en,
    'paciente', jsonb_build_object(
      'nombre', pa.nombre_paciente,
      'apellido', pa.apellido_paciente,
      'dni', pa.dni_paciente
    ),
    'turno', jsonb_build_object(
      'fecha', t.fecha,
      'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
      'hora_fin', to_char(t.hora_fin, 'HH24:MI'),
      'estado', t.estado,
      'nombre_profesional', u.nombre_usuario,
      'apellido_profesional', u.apellido_usuario,
      'nombre_servicio', s.nombre_servicio
    ),
    'cobertura', coalesce(o.nombre_obra_social, 'Particular'),
    'numero_afiliado', t.numero_afiliado,
    'importe_base', p.importe_base,
    'descuento', p.descuento,
    'importe_final', p.importe_final,
    'medio_pago', p.medio_pago,
    -- HU-17: misma regla de estado de cobro (acá siempre pagado o reembolsado).
    'estado_cobro', public.fn_estado_cobro(t.estado, true, r.id_reembolso is not null),
    'reembolso', case when r.id_reembolso is null then null else jsonb_build_object(
      'importe', r.importe,
      'medio_devolucion', r.medio_devolucion,
      'registrado_en', r.registrado_en
    ) end
  )
  into v_resultado
  from public.pago p
  join public.turno t on t.id_turno = p.id_turno
  join public.paciente pa on pa.id_paciente = p.id_paciente
  join public.usuario u on u.id_usuario = t.id_profesional
  join public.servicio s on s.id_servicio = t.id_servicio
  left join public.obra_social o on o.id_obra_social = t.id_obra_social
  left join public.usuario ur on ur.id_usuario = p.registrado_por
  left join public.reembolso r on r.id_pago = p.id_pago
  where p.id_pago = p_id_pago;

  -- Sin pago no hay comprobante (no se emiten "en blanco" ni de turnos pendientes).
  if v_resultado is null then
    raise exception 'El comprobante no existe';
  end if;

  return v_resultado;
end;
$$;

-- ============ Pago de un turno (024 + número de comprobante) ============
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
      'numero_comprobante', p.numero_comprobante, -- HU-35
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

-- ============ Listado de pagos (023 + número de comprobante y su búsqueda) ============
-- p_numero_comprobante: null = todos; si no, el pago con ese número (combinable con el resto).
drop function if exists public.fn_listar_pagos(text, date, date, integer, text);

create or replace function public.fn_listar_pagos(
  p_texto text default null,
  p_desde date default null,
  p_hasta date default null,
  p_pagina integer default 1,
  p_reembolso text default null,
  p_numero_comprobante bigint default null
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

  if p_numero_comprobante is not null and p_numero_comprobante <= 0 then
    raise exception 'El número de comprobante no es válido';
  end if;

  if v_texto <> '' then
    v_palabras := regexp_split_to_array(lower(v_texto), '\s+');
  end if;

  with coincidencias as (
    select
      p.id_pago,
      p.id_turno,
      p.numero_comprobante,
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
      -- HU-35: búsqueda por número de comprobante.
      and (p_numero_comprobante is null or p.numero_comprobante = p_numero_comprobante)
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
            'numero_comprobante', g.numero_comprobante,
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
revoke all on function public.fn_obtener_comprobante(uuid) from public, anon;
revoke all on function public.fn_obtener_pago(uuid) from public, anon;
revoke all on function public.fn_listar_pagos(text, date, date, integer, text, bigint) from public, anon;

grant execute on function public.fn_obtener_comprobante(uuid) to authenticated;
grant execute on function public.fn_obtener_pago(uuid) to authenticated;
grant execute on function public.fn_listar_pagos(text, date, date, integer, text, bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
