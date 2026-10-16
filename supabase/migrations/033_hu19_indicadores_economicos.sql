-- HU-19. Indicadores económicos del centro (solo Gerente). Sección "Económicos" de /indicadores.
--
-- Ingreso = dinero recibido y registrado como pago (HU-14). No hay importes estimados ni
-- facturación a obras sociales.
--   * Ingresos brutos: suma de pago.importe_final (el vigente: si se corrigió, el corregido),
--     por FECHA DEL PAGO en hora de Argentina (igual que el listado de HU-14).
--   * Reembolsos (HU-22): restan en el período en que se REGISTRAN, no en el del pago original.
--   * Netos = brutos - reembolsos.
--   * Evolución: período anterior de igual duración (los mismos días, justo antes).
--     Si los netos del anterior son 0, el % va null ("Sin datos para comparar").
--   * Pendientes de cobro: turnos del período (por fecha del turno) con la regla de HU-17.
--   * (Should) Netos de los últimos 6 meses (el mes de "hasta" y los 5 anteriores) y desglose
--     por servicio y por profesional del turno cobrado.
--
-- Solo lectura: no crea tablas ni cambia funciones existentes.
begin;

create or replace function public.fn_consultar_indicadores_economicos(
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias integer;
  v_ant_desde date;
  v_ant_hasta date;
  v_brutos numeric;
  v_cantidad integer;
  v_reembolsos numeric;
  v_cant_reembolsos integer;
  v_ant_brutos numeric;
  v_ant_reembolsos numeric;
  v_netos numeric;
  v_ant_netos numeric;
  v_mes_fin date;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  if p_desde is null or p_hasta is null then
    raise exception 'Elegí el período (desde y hasta)';
  end if;

  if p_desde > p_hasta then
    raise exception 'La fecha desde no puede ser posterior a la fecha hasta';
  end if;

  if p_hasta - p_desde > 366 then
    raise exception 'El período no puede superar un año';
  end if;

  -- Período anterior de igual duración, justo antes del elegido.
  v_dias := p_hasta - p_desde + 1;
  v_ant_hasta := p_desde - 1;
  v_ant_desde := p_desde - v_dias;

  -- Pagos del período (por fecha del pago, hora AR).
  select coalesce(sum(p.importe_final), 0), count(*)::integer
  into v_brutos, v_cantidad
  from public.pago p
  where (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date
    between p_desde and p_hasta;

  -- Reembolsos del período (por fecha del reembolso, hora AR).
  select coalesce(sum(r.importe), 0), count(*)::integer
  into v_reembolsos, v_cant_reembolsos
  from public.reembolso r
  where (timezone('America/Argentina/Buenos_Aires', r.registrado_en))::date
    between p_desde and p_hasta;

  -- Lo mismo para el período anterior.
  select coalesce(sum(p.importe_final), 0) into v_ant_brutos
  from public.pago p
  where (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date
    between v_ant_desde and v_ant_hasta;

  select coalesce(sum(r.importe), 0) into v_ant_reembolsos
  from public.reembolso r
  where (timezone('America/Argentina/Buenos_Aires', r.registrado_en))::date
    between v_ant_desde and v_ant_hasta;

  v_netos := v_brutos - v_reembolsos;
  v_ant_netos := v_ant_brutos - v_ant_reembolsos;

  -- Último día del mes de "hasta" (para los últimos 6 meses).
  v_mes_fin := (date_trunc('month', p_hasta) + interval '1 month - 1 day')::date;

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'anterior', jsonb_build_object('desde', v_ant_desde, 'hasta', v_ant_hasta),

    'ingresos', jsonb_build_object(
      'brutos', v_brutos,
      'reembolsos', v_reembolsos,
      'netos', v_netos,
      'cantidad_pagos', v_cantidad,
      'cantidad_reembolsos', v_cant_reembolsos,
      'promedio', case when v_cantidad = 0 then 0 else round(v_brutos / v_cantidad, 2) end
    ),

    -- Evolución de los netos contra el período anterior.
    'evolucion', jsonb_build_object(
      'netos_anterior', v_ant_netos,
      'brutos_anterior', v_ant_brutos,
      'reembolsos_anterior', v_ant_reembolsos,
      'variacion_pesos', v_netos - v_ant_netos,
      -- Sin dividir por cero: anterior en 0 → null ("Sin datos para comparar").
      'variacion_porcentaje', case
        when v_ant_netos = 0 then null
        else round((v_netos - v_ant_netos) / abs(v_ant_netos) * 100, 1)
      end
    ),

    -- Desglose por medio: los 5 medios siempre (los que no tuvieron pagos, en 0).
    'por_medio', (
      select jsonb_agg(
        jsonb_build_object(
          'medio', m.medio,
          'importe', coalesce(x.importe, 0),
          'cantidad', coalesce(x.cantidad, 0)
        )
        order by m.orden
      )
      from (values
        ('efectivo', 1), ('transferencia', 2), ('debito', 3), ('credito', 4), ('billetera', 5)
      ) as m(medio, orden)
      left join (
        select p.medio_pago, sum(p.importe_final) as importe, count(*)::integer as cantidad
        from public.pago p
        where (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date
          between p_desde and p_hasta
        group by p.medio_pago
      ) x on x.medio_pago = m.medio
    ),

    -- Particular frente a obra social (cobertura del turno cobrado) y descuentos aplicados.
    'cobertura', (
      select jsonb_build_object(
        'particular_importe', coalesce(sum(p.importe_final) filter (where t.id_obra_social is null), 0),
        'particular_cantidad', (count(*) filter (where t.id_obra_social is null))::integer,
        'obra_social_importe', coalesce(sum(p.importe_final) filter (where t.id_obra_social is not null), 0),
        'obra_social_cantidad', (count(*) filter (where t.id_obra_social is not null))::integer,
        'descuentos', coalesce(sum(p.descuento), 0)
      )
      from public.pago p
      join public.turno t on t.id_turno = p.id_turno
      where (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date
        between p_desde and p_hasta
    ),

    -- HU-17: turnos del período (por fecha del turno) pendientes de cobro. No se estima importe.
    'pendientes_cobro', (
      select count(*)::integer
      from public.turno t
      left join public.pago pg on pg.id_turno = t.id_turno
      left join public.reembolso r on r.id_pago = pg.id_pago
      where t.fecha between p_desde and p_hasta
        and public.fn_estado_cobro(t.estado, pg.id_pago is not null, r.id_reembolso is not null)
          = 'pendiente'
    ),

    -- (Should) Netos de los últimos 6 meses, mes por mes (incluye meses en 0).
    'meses', (
      select jsonb_agg(
        jsonb_build_object(
          'mes', to_char(m.inicio, 'YYYY-MM'),
          'brutos', coalesce(b.importe, 0),
          'reembolsos', coalesce(rr.importe, 0),
          'netos', coalesce(b.importe, 0) - coalesce(rr.importe, 0)
        )
        order by m.inicio
      )
      from (
        select (date_trunc('month', v_mes_fin) - make_interval(months => n))::date as inicio
        from generate_series(0, 5) as n
      ) m
      left join lateral (
        select sum(p.importe_final) as importe
        from public.pago p
        where date_trunc('month', timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date
          = m.inicio
      ) b on true
      left join lateral (
        select sum(r.importe) as importe
        from public.reembolso r
        where date_trunc('month', timezone('America/Argentina/Buenos_Aires', r.registrado_en))::date
          = m.inicio
      ) rr on true
    ),

    -- (Should) Desglose por servicio del turno cobrado (ingresos brutos).
    'por_servicio', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id_servicio', x.id_servicio,
          'nombre', x.nombre,
          'importe', x.importe,
          'cantidad', x.cantidad
        )
        order by x.importe desc, x.nombre
      )
      from (
        select s.id_servicio, s.nombre_servicio as nombre,
               sum(p.importe_final) as importe, count(*)::integer as cantidad
        from public.pago p
        join public.turno t on t.id_turno = p.id_turno
        join public.servicio s on s.id_servicio = t.id_servicio
        where (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date
          between p_desde and p_hasta
        group by s.id_servicio, s.nombre_servicio
      ) x
    ), '[]'::jsonb),

    -- (Should) Desglose por profesional del turno cobrado (ingresos brutos).
    'por_profesional', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id_profesional', x.id_profesional,
          'nombre', x.nombre,
          'apellido', x.apellido,
          'importe', x.importe,
          'cantidad', x.cantidad
        )
        order by x.importe desc, x.apellido, x.nombre
      )
      from (
        select u.id_usuario as id_profesional, u.nombre_usuario as nombre,
               u.apellido_usuario as apellido,
               sum(p.importe_final) as importe, count(*)::integer as cantidad
        from public.pago p
        join public.turno t on t.id_turno = p.id_turno
        join public.usuario u on u.id_usuario = t.id_profesional
        where (timezone('America/Argentina/Buenos_Aires', p.registrado_en))::date
          between p_desde and p_hasta
        group by u.id_usuario, u.nombre_usuario, u.apellido_usuario
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fn_consultar_indicadores_economicos(date, date) from public, anon;
grant execute on function public.fn_consultar_indicadores_economicos(date, date) to authenticated;

notify pgrst, 'reload schema';

commit;
