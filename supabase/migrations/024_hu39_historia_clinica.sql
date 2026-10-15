-- HU-39. Registrar y consultar la historia clínica del paciente (Profesional). Issue #73.
--
-- La historia clínica es del PACIENTE (una sola, compartida por los profesionales que lo
-- atienden). Tiene dos partes:
--   * Ficha clínica: seis textos opcionales de hasta 1000 caracteres (tabla historia_clinica).
--   * Evolución: las atenciones del paciente (HU-13 + orden médica de HU-24A), solo lectura.
-- Editar nunca pisa sin dejar rastro: antes de guardar, la versión anterior se copia a
-- historia_clinica_version (quién y cuándo la había escrito, y qué valores tenía).
-- Solo la ven y la editan los Profesionales con al menos un turno (cualquier estado) con el
-- paciente. Mesa de Entradas y Gerente no (lo clínico es de los profesionales).
-- El id del profesional sale siempre de auth.uid().
begin;

-- ============ Tablas ============
create table public.historia_clinica (
  id_historia uuid primary key default gen_random_uuid(),
  id_paciente uuid not null references public.paciente (id_paciente),
  antecedentes_personales text,
  antecedentes_quirurgicos text, -- quirúrgicos y traumatológicos
  alergias text,
  medicacion_actual text,
  diagnostico text, -- diagnóstico principal / motivo del tratamiento
  observaciones_generales text,
  creado_en timestamptz not null default now(),
  creado_por uuid not null references public.usuario (id_usuario),
  modificado_en timestamptz not null default now(),
  modificado_por uuid not null references public.usuario (id_usuario),
  constraint historia_clinica_una_por_paciente unique (id_paciente),
  constraint historia_clinica_largos check (
    coalesce(char_length(antecedentes_personales), 0) <= 1000
    and coalesce(char_length(antecedentes_quirurgicos), 0) <= 1000
    and coalesce(char_length(alergias), 0) <= 1000
    and coalesce(char_length(medicacion_actual), 0) <= 1000
    and coalesce(char_length(diagnostico), 0) <= 1000
    and coalesce(char_length(observaciones_generales), 0) <= 1000
  )
);

-- Versiones anteriores: una fila por cada edición, con los valores que había antes.
create table public.historia_clinica_version (
  id_version uuid primary key default gen_random_uuid(),
  id_historia uuid not null references public.historia_clinica (id_historia),
  antecedentes_personales text,
  antecedentes_quirurgicos text,
  alergias text,
  medicacion_actual text,
  diagnostico text,
  observaciones_generales text,
  -- Quién y cuándo había escrito esa versión.
  modificado_en timestamptz not null,
  modificado_por uuid not null references public.usuario (id_usuario),
  -- Cuándo quedó reemplazada (momento de la edición siguiente).
  reemplazada_en timestamptz not null default now()
);

create index idx_historia_clinica_version on public.historia_clinica_version (id_historia, reemplazada_en);

alter table public.historia_clinica enable row level security;
alter table public.historia_clinica_version enable row level security;
revoke all on public.historia_clinica from public, anon, authenticated;
revoke all on public.historia_clinica_version from public, anon, authenticated;

-- ============ Helper interno: ¿el profesional logueado atiende a este paciente? ============
-- Profesional activo (HU-08) con al menos un turno con el paciente, en cualquier estado.
-- Mismo mensaje si el paciente no existe: no se revela qué ids existen.
create or replace function public.fn_exigir_paciente_propio(p_id_paciente uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_exigir_rol(array['Profesional']);

  if p_id_paciente is null or not exists (
    select 1
    from public.turno t
    where t.id_paciente = p_id_paciente
      and t.id_profesional = auth.uid()
  ) then
    raise exception 'No tenés turnos con este paciente';
  end if;
end;
$$;

revoke all on function public.fn_exigir_paciente_propio(uuid) from public, anon, authenticated;

-- ============ Consultar la historia clínica ============
create or replace function public.fn_obtener_historia_clinica(p_id_paciente uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_historia public.historia_clinica;
begin
  perform public.fn_exigir_paciente_propio(p_id_paciente);

  select h.* into v_historia
  from public.historia_clinica h
  where h.id_paciente = p_id_paciente;

  return jsonb_build_object(
    'paciente', (
      select jsonb_build_object(
        'id_paciente', pa.id_paciente,
        'nombre_paciente', pa.nombre_paciente,
        'apellido_paciente', pa.apellido_paciente,
        'dni_paciente', pa.dni_paciente,
        'fecha_nacimiento_paciente', pa.fecha_nacimiento_paciente,
        'telefono_paciente', pa.telefono_paciente
      )
      from public.paciente pa
      where pa.id_paciente = p_id_paciente
    ),
    -- null = todavía no se cargó la ficha.
    'ficha', case when v_historia.id_historia is null then null else (
      select jsonb_build_object(
        'antecedentes_personales', v_historia.antecedentes_personales,
        'antecedentes_quirurgicos', v_historia.antecedentes_quirurgicos,
        'alergias', v_historia.alergias,
        'medicacion_actual', v_historia.medicacion_actual,
        'diagnostico', v_historia.diagnostico,
        'observaciones_generales', v_historia.observaciones_generales,
        'creado_en', v_historia.creado_en,
        'modificado_en', v_historia.modificado_en,
        'modificado_por', u.nombre_usuario || ' ' || u.apellido_usuario
      )
      from public.usuario u
      where u.id_usuario = v_historia.modificado_por
    ) end,
    -- Versiones anteriores, de la más nueva a la más vieja.
    'versiones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'antecedentes_personales', v.antecedentes_personales,
          'antecedentes_quirurgicos', v.antecedentes_quirurgicos,
          'alergias', v.alergias,
          'medicacion_actual', v.medicacion_actual,
          'diagnostico', v.diagnostico,
          'observaciones_generales', v.observaciones_generales,
          'modificado_en', v.modificado_en,
          'modificado_por', u.nombre_usuario || ' ' || u.apellido_usuario,
          'reemplazada_en', v.reemplazada_en
        )
        order by v.reemplazada_en desc
      )
      from public.historia_clinica_version v
      join public.usuario u on u.id_usuario = v.modificado_por
      where v.id_historia = v_historia.id_historia
    ), '[]'::jsonb),
    -- Evolución: todas las atenciones del paciente (con cualquier profesional), la más reciente primero.
    'evolucion', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id_turno', a.id_turno,
          'fecha_atencion', a.fecha_atencion,
          'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
          'profesional', u.apellido_usuario || ', ' || u.nombre_usuario,
          'nombre_servicio', s.nombre_servicio,
          'motivo_consulta', a.motivo_consulta,
          'observaciones', a.observaciones,
          'orden_medica', a.orden_medica
        )
        order by a.fecha_atencion desc, t.hora_inicio desc
      )
      from public.atencion a
      join public.turno t on t.id_turno = a.id_turno
      join public.usuario u on u.id_usuario = a.id_profesional
      join public.servicio s on s.id_servicio = t.id_servicio
      where a.id_paciente = p_id_paciente
    ), '[]'::jsonb)
  );
end;
$$;

-- ============ Guardar (crear o editar) la ficha clínica ============
-- Vacío o solo espacios = sin dato. Tiene que quedar al menos un campo con texto.
-- Si nada cambió no se crea una versión nueva.
create or replace function public.fn_guardar_historia_clinica(
  p_id_paciente uuid,
  p_antecedentes_personales text default null,
  p_antecedentes_quirurgicos text default null,
  p_alergias text default null,
  p_medicacion_actual text default null,
  p_diagnostico text default null,
  p_observaciones_generales text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_personales text := nullif(trim(p_antecedentes_personales), '');
  v_quirurgicos text := nullif(trim(p_antecedentes_quirurgicos), '');
  v_alergias text := nullif(trim(p_alergias), '');
  v_medicacion text := nullif(trim(p_medicacion_actual), '');
  v_diagnostico text := nullif(trim(p_diagnostico), '');
  v_observaciones text := nullif(trim(p_observaciones_generales), '');
  v_actual public.historia_clinica;
begin
  perform public.fn_exigir_paciente_propio(p_id_paciente);

  if greatest(
    coalesce(char_length(v_personales), 0),
    coalesce(char_length(v_quirurgicos), 0),
    coalesce(char_length(v_alergias), 0),
    coalesce(char_length(v_medicacion), 0),
    coalesce(char_length(v_diagnostico), 0),
    coalesce(char_length(v_observaciones), 0)
  ) > 1000 then
    raise exception 'Cada campo de la historia clínica puede tener hasta 1000 caracteres';
  end if;

  if coalesce(v_personales, v_quirurgicos, v_alergias, v_medicacion, v_diagnostico, v_observaciones) is null then
    raise exception 'Completá al menos un campo de la historia clínica';
  end if;

  -- Dos profesionales guardando a la vez la misma ficha: se atienden de a uno.
  perform pg_advisory_xact_lock(hashtextextended('historia_clinica' || p_id_paciente::text, 0));

  select h.* into v_actual
  from public.historia_clinica h
  where h.id_paciente = p_id_paciente
  for update;

  if v_actual.id_historia is null then
    insert into public.historia_clinica (
      id_paciente, antecedentes_personales, antecedentes_quirurgicos, alergias,
      medicacion_actual, diagnostico, observaciones_generales, creado_por, modificado_por
    )
    values (
      p_id_paciente, v_personales, v_quirurgicos, v_alergias,
      v_medicacion, v_diagnostico, v_observaciones, auth.uid(), auth.uid()
    );
  elsif (v_actual.antecedentes_personales, v_actual.antecedentes_quirurgicos, v_actual.alergias,
         v_actual.medicacion_actual, v_actual.diagnostico, v_actual.observaciones_generales)
        is distinct from
        (v_personales, v_quirurgicos, v_alergias, v_medicacion, v_diagnostico, v_observaciones) then
    -- Se guarda la versión anterior y recién después se pisa.
    insert into public.historia_clinica_version (
      id_historia, antecedentes_personales, antecedentes_quirurgicos, alergias,
      medicacion_actual, diagnostico, observaciones_generales, modificado_en, modificado_por
    )
    values (
      v_actual.id_historia, v_actual.antecedentes_personales, v_actual.antecedentes_quirurgicos,
      v_actual.alergias, v_actual.medicacion_actual, v_actual.diagnostico,
      v_actual.observaciones_generales, v_actual.modificado_en, v_actual.modificado_por
    );

    update public.historia_clinica
    set antecedentes_personales = v_personales,
        antecedentes_quirurgicos = v_quirurgicos,
        alergias = v_alergias,
        medicacion_actual = v_medicacion,
        diagnostico = v_diagnostico,
        observaciones_generales = v_observaciones,
        modificado_en = now(),
        modificado_por = auth.uid()
    where id_historia = v_actual.id_historia;
  end if;

  return public.fn_obtener_historia_clinica(p_id_paciente);
end;
$$;

-- ============ Permisos ============
revoke all on function public.fn_obtener_historia_clinica(uuid) from public, anon;
revoke all on function public.fn_guardar_historia_clinica(uuid, text, text, text, text, text, text) from public, anon;

grant execute on function public.fn_obtener_historia_clinica(uuid) to authenticated;
grant execute on function public.fn_guardar_historia_clinica(uuid, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
