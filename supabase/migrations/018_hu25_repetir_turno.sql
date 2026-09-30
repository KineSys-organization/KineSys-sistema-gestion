-- HU-25. Repetir un turno confirmado en las próximas semanas (serie semanal).
--
-- La serie nace de un turno Confirmado con paciente. Se repite el mismo día de la semana,
-- a la misma hora, con el mismo paciente, profesional, servicio y cobertura, hasta 24 veces.
-- Cada turno de la serie es independiente: cancelar / ausente / reprogramar (HU-10A/B/C)
-- trabajan por id_turno, así que tocan solo ese turno.
--
-- Misma regla que otorgar, sin duplicarla: el cuerpo de fn_consultar_disponibilidad
-- (profesional activo, servicio asociado, franjas HU-02B, granularidad y ocupación) pasa a
-- la función interna fn_horarios_del_dia. fn_consultar_disponibilidad queda como envoltorio
-- (rol + fecha pasada + ventana de 30 días) y devuelve exactamente lo mismo que antes.
-- Decisión del equipo: la ventana de 30 días es de la pantalla de búsqueda; la serie no la
-- usa (si no, a partir de la 5ª semana ninguna fecha estaría disponible).
--
-- Cambios:
--   * tabla serie_turno + turno.id_serie (el turno original también queda en la serie)
--   * fn_horarios_del_dia (interna) y fn_consultar_disponibilidad (envoltorio)
--   * fn_evaluar_repeticion (interna): ¿se puede dar ESE horario ESE día? y si no, por qué
--   * fn_turno_repetir_preview(turno, semanas): no escribe nada
--   * fn_turno_repetir_confirmar(turno, semanas): crea solo las fechas libres
begin;

-- ============ Modelo: la serie ============
create table public.serie_turno (
  id_serie uuid primary key default gen_random_uuid(),
  id_turno_origen uuid not null references public.turno (id_turno),
  id_paciente uuid not null references public.paciente (id_paciente),
  id_profesional uuid not null references public.profesional (id_usuario),
  id_servicio uuid not null references public.servicio (id_servicio),
  creada_por uuid not null references public.usuario (id_usuario),
  creada_en timestamptz not null default now()
);

-- null = turno suelto (como todos los turnos de antes de HU-25).
alter table public.turno
  add column id_serie uuid references public.serie_turno (id_serie);

create index idx_turno_serie on public.turno (id_serie) where id_serie is not null;

-- Cerrada como las tablas de HU-04 / HU-13: se accede solo por las fn_*.
alter table public.serie_turno enable row level security;
revoke all on public.serie_turno from public, anon, authenticated;

-- ============ HU-05: el cálculo de horarios pasa a una función interna ============
-- Copia de 015 sin el chequeo de rol ni el de fechas (eso queda en el envoltorio).
-- Suma 'en_franja': todos los horarios que arma la franja, estén ocupados o no.
-- Sirve para distinguir "ocupado" de "fuera de franja".
create or replace function public.fn_horarios_del_dia(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_excluir_turno uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date;
  v_ahora time;
  v_dia integer;
  v_duracion integer;
  v_paso integer;
  v_slots jsonb := '[]'::jsonb;
  v_en_franja jsonb := '[]'::jsonb;
  v_franja record;
  v_inicio time;
  v_fin_slot time;
  v_ocupado boolean;
  v_nombre text;
  v_apellido text;
  v_servicio text;
begin
  v_hoy := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_ahora := (timezone('America/Argentina/Buenos_Aires', now()))::time;

  -- Profesional activo + usuario activo + servicio asociado y activo
  select u.nombre_usuario, u.apellido_usuario
  into v_nombre, v_apellido
  from public.profesional p
  join public.usuario u on u.id_usuario = p.id_usuario
  where p.id_usuario = p_id_profesional
    and p.activo = true
    and u.activo = true
    and u.rol_usuario = 'Profesional';

  if v_nombre is null then
    raise exception 'El profesional no existe o no está activo';
  end if;

  if not exists (
    select 1
    from public.servicio_profesional sp
    join public.servicio s on s.id_servicio = sp.id_servicio
    where sp.id_usuario = p_id_profesional
      and sp.id_servicio = p_id_servicio
      and s.activo = true
  ) then
    raise exception 'El servicio no está asociado a ese profesional o no está activo';
  end if;

  select s.nombre_servicio, s.duracion_minutos, s.granularidad_minutos
  into v_servicio, v_duracion, v_paso
  from public.servicio s
  where s.id_servicio = p_id_servicio;

  if v_duracion is null or v_duracion <= 0 then
    raise exception 'El servicio no tiene una duración válida';
  end if;

  if v_paso is null or v_paso <= 0 then
    v_paso := v_duracion;
  end if;

  -- ISO: lunes=1 .. domingo=7. Sábado y domingo valen si el profesional tiene franja.
  v_dia := extract(isodow from p_fecha)::integer;

  if not exists (
    select 1
    from public.franja_profesional f
    where f.id_usuario = p_id_profesional
      and f.dia_semana = v_dia
  ) then
    return jsonb_build_object(
      'fecha', p_fecha,
      'id_profesional', p_id_profesional,
      'nombre_profesional', v_nombre,
      'apellido_profesional', v_apellido,
      'id_servicio', p_id_servicio,
      'nombre_servicio', v_servicio,
      'duracion_minutos', v_duracion,
      'horarios', '[]'::jsonb,
      'mensaje', 'No hay horarios para esa fecha',
      'en_franja', '[]'::jsonb
    );
  end if;

  for v_franja in
    select f.hora_inicio, f.hora_fin
    from public.franja_profesional f
    where f.id_usuario = p_id_profesional
      and f.dia_semana = v_dia
    order by f.hora_inicio
  loop
    v_inicio := v_franja.hora_inicio;

    while v_inicio + make_interval(mins => v_duracion) <= v_franja.hora_fin loop
      v_fin_slot := v_inicio + make_interval(mins => v_duracion);
      v_en_franja := v_en_franja || jsonb_build_array(to_char(v_inicio, 'HH24:MI'));

      -- No ofrecer horarios pasados (solo el día de hoy)
      if p_fecha = v_hoy and v_inicio < v_ahora then
        v_inicio := v_inicio + make_interval(mins => v_paso);
        continue;
      end if;

      select exists (
        select 1
        from public.turno t
        where t.id_profesional = p_id_profesional
          and t.fecha = p_fecha
          and t.estado in ('confirmado', 'atendido', 'ausente') -- HU-13 / HU-10B
          and t.id_turno is distinct from p_excluir_turno -- HU-10C
          and t.hora_inicio < v_fin_slot
          and t.hora_fin > v_inicio
      ) into v_ocupado;

      if not v_ocupado then
        v_slots := v_slots || jsonb_build_array(to_char(v_inicio, 'HH24:MI'));
      end if;

      v_inicio := v_inicio + make_interval(mins => v_paso);
    end loop;
  end loop;

  return jsonb_build_object(
    'fecha', p_fecha,
    'id_profesional', p_id_profesional,
    'nombre_profesional', v_nombre,
    'apellido_profesional', v_apellido,
    'id_servicio', p_id_servicio,
    'nombre_servicio', v_servicio,
    'duracion_minutos', v_duracion,
    'horarios', v_slots,
    'mensaje', case
      when jsonb_array_length(v_slots) = 0 then 'No hay horarios para esa fecha'
      else null
    end,
    'en_franja', v_en_franja
  );
end;
$$;

-- Envoltorio: misma firma y misma respuesta que en 015 (sin 'en_franja').
-- La usan la pantalla de disponibilidad, el calendario, otorgar (HU-06) y reprogramar (HU-10C).
create or replace function public.fn_consultar_disponibilidad(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_excluir_turno uuid default null
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
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para consultar disponibilidad';
  end if;

  if p_id_profesional is null or p_id_servicio is null or p_fecha is null then
    raise exception 'Faltan campos';
  end if;

  if p_fecha < v_hoy then
    raise exception 'No se puede consultar una fecha pasada';
  end if;

  if p_fecha > v_hoy + 30 then
    raise exception 'Solo se puede consultar disponibilidad hasta 30 días desde hoy';
  end if;

  return public.fn_horarios_del_dia(
    p_id_profesional, p_id_servicio, p_fecha, p_excluir_turno
  ) - 'en_franja';
end;
$$;

-- ============ HU-25: ¿se puede dar ese horario ese día? ============
-- Interna. Devuelve { disponible, motivo, hora_fin }. La usan el preview y el confirmar,
-- así los dos deciden con la misma regla.
create or replace function public.fn_evaluar_repeticion(
  p_id_profesional uuid,
  p_id_servicio uuid,
  p_fecha date,
  p_hora time
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disp jsonb;
  v_hora text := to_char(p_hora, 'HH24:MI');
  v_hora_fin time;
begin
  if p_fecha + p_hora < timezone('America/Argentina/Buenos_Aires', now()) then
    return jsonb_build_object('disponible', false, 'motivo', 'Fecha pasada', 'hora_fin', null);
  end if;

  begin
    v_disp := public.fn_horarios_del_dia(p_id_profesional, p_id_servicio, p_fecha);
  exception when others then
    -- Profesional inactivo o servicio ya no asociado: el mensaje de HU-05 es el motivo.
    return jsonb_build_object(
      'disponible', false,
      'motivo', case
        when sqlerrm = 'El profesional no existe o no está activo' then 'Profesional inactivo'
        else sqlerrm
      end,
      'hora_fin', null
    );
  end;

  v_hora_fin := p_hora + make_interval(mins => (v_disp ->> 'duracion_minutos')::integer);

  if (v_disp -> 'horarios') ? v_hora then
    return jsonb_build_object('disponible', true, 'motivo', null, 'hora_fin', v_hora_fin);
  end if;

  if (v_disp -> 'en_franja') ? v_hora then
    return jsonb_build_object('disponible', false, 'motivo', 'Horario ocupado', 'hora_fin', v_hora_fin);
  end if;

  return jsonb_build_object(
    'disponible', false,
    'motivo', 'Fuera de la franja del profesional',
    'hora_fin', v_hora_fin
  );
end;
$$;

-- ============ HU-25: validaciones comunes del turno origen ============
-- Interna. Rol, semanas, turno confirmado con paciente activo. Devuelve el turno.
create or replace function public.fn_turno_repetible(p_id_turno uuid, p_semanas integer)
returns public.turno
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_turno public.turno;
begin
  if not public.fn_es_recepcion() then
    raise exception 'No tenés permiso para repetir turnos';
  end if;

  if p_id_turno is null or p_semanas is null then
    raise exception 'Faltan campos';
  end if;

  if p_semanas < 1 or p_semanas > 24 then
    raise exception 'Podés repetir el turno entre 1 y 24 semanas';
  end if;

  select * into v_turno from public.turno t where t.id_turno = p_id_turno;

  if v_turno.id_turno is null then
    raise exception 'El turno no existe';
  end if;

  if v_turno.estado <> 'confirmado' then
    raise exception 'Solo se puede repetir un turno confirmado';
  end if;

  if v_turno.id_paciente is null then
    raise exception 'El turno no tiene un paciente asociado';
  end if;

  if not exists (
    select 1 from public.paciente
    where id_paciente = v_turno.id_paciente and activo = true
  ) then
    raise exception 'El paciente no existe o no está activo';
  end if;

  return v_turno;
end;
$$;

-- ============ HU-25: preview (no escribe nada) ============
create or replace function public.fn_turno_repetir_preview(
  p_id_turno uuid,
  p_semanas integer
)
returns table (
  fecha date,
  hora_inicio text,
  hora_fin text,
  disponible boolean,
  motivo text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turno := public.fn_turno_repetible(p_id_turno, p_semanas);
  v_semana integer;
  v_eval jsonb;
begin
  for v_semana in 1..p_semanas loop
    fecha := v_turno.fecha + 7 * v_semana;
    v_eval := public.fn_evaluar_repeticion(
      v_turno.id_profesional, v_turno.id_servicio, fecha, v_turno.hora_inicio
    );
    hora_inicio := to_char(v_turno.hora_inicio, 'HH24:MI');
    hora_fin := to_char(coalesce((v_eval ->> 'hora_fin')::time, v_turno.hora_fin), 'HH24:MI');
    disponible := (v_eval ->> 'disponible')::boolean;
    motivo := v_eval ->> 'motivo';
    return next;
  end loop;
end;
$$;

-- ============ HU-25: confirmar (crea solo las fechas libres) ============
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
        id_serie
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
        v_id_serie
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
-- Internas: solo se llaman desde otras fn_* (security definer).
revoke all on function public.fn_horarios_del_dia(uuid, uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.fn_evaluar_repeticion(uuid, uuid, date, time) from public, anon, authenticated;
revoke all on function public.fn_turno_repetible(uuid, integer) from public, anon, authenticated;

revoke all on function public.fn_consultar_disponibilidad(uuid, uuid, date, uuid) from public, anon;
revoke all on function public.fn_turno_repetir_preview(uuid, integer) from public, anon;
revoke all on function public.fn_turno_repetir_confirmar(uuid, integer) from public, anon;

grant execute on function public.fn_consultar_disponibilidad(uuid, uuid, date, uuid) to authenticated;
grant execute on function public.fn_turno_repetir_preview(uuid, integer) to authenticated;
grant execute on function public.fn_turno_repetir_confirmar(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
