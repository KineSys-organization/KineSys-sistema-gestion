-- HU-09. Buscar y filtrar turnos (listado transversal para Recepción).
--
-- Una sola función nueva. No cambia tablas ni reemplaza funciones existentes.
-- Todos los filtros son opcionales y se combinan con AND:
--   p_texto:          paciente. Cada palabra tiene que coincidir con el nombre, el apellido
--                     o (si son dígitos) el comienzo del DNI. "Ana Pérez" → Ana Y Pérez.
--   p_id_profesional: null = todos.
--   p_id_servicio:    null = todos (catálogo de HU-01; no hay "especialidad").
--   p_desde/p_hasta:  rango inclusivo; cualquiera de los dos puede faltar.
--   p_estado:         null o 'todos' = todos; si no, confirmado/cancelado/atendido/ausente.
--   p_pagina:         de a 10, ordenado por fecha y hora de inicio (ascendente).
-- Devuelve { total, pagina, por_pagina, turnos: [...] }.
begin;

create or replace function public.fn_buscar_turnos(
  p_texto text default null,
  p_id_profesional uuid default null,
  p_id_servicio uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_estado text default null,
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
  v_estado text := lower(nullif(trim(coalesce(p_estado, '')), ''));
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

revoke all on function public.fn_buscar_turnos(text, uuid, uuid, date, date, text, integer) from public, anon;
grant execute on function public.fn_buscar_turnos(text, uuid, uuid, date, date, text, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
