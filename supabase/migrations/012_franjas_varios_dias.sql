-- Cargar la misma franja horaria en varios días de una sola vez.
-- Ejemplo: lunes a viernes de 09:00 a 12:00 = 5 franjas con un solo clic.
--
-- Es todo o nada: si un día se superpone con una franja existente, no se guarda
-- ningún día y el error dice cuál chocó. Así nunca queda una carga a medias.
--
-- No reemplaza a fn_registrar_franja_profesional (HU-02B, un día): queda igual.
-- La edición de franjas (fn_editar_franja_profesional, HU-03) sigue siendo de a una.
-- Rol validado con fn_exigir_rol (HU-08): Gerente activo.
begin;

create or replace function public.fn_registrar_franjas_profesional(
  p_id_usuario uuid,
  p_dias integer[],
  p_hora_inicio time without time zone,
  p_hora_fin time without time zone
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 1 = lunes ... 7 = domingo (mismo criterio que franja_profesional.dia_semana)
  v_nombres text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  v_dias integer[];
  v_dia integer;
  v_choque record;
begin
  perform public.fn_exigir_rol(array['Gerente']);

  -- Bloquea al profesional: dos cargas a la vez para el mismo profesional van de a una.
  perform 1 from public.profesional where id_usuario = p_id_usuario for update;
  if not found then
    raise exception 'El profesional no existe';
  end if;

  if not exists (select 1 from public.servicio_profesional where id_usuario = p_id_usuario) then
    raise exception 'El profesional debe tener al menos un servicio asociado';
  end if;

  if p_dias is null or cardinality(p_dias) = 0 then
    raise exception 'Seleccioná al menos un día de la semana';
  end if;

  if exists (select 1 from unnest(p_dias) d where d is null or d not between 1 and 7) then
    raise exception 'Seleccioná un día de la semana válido';
  end if;

  -- Sin repetidos y ordenados (lunes primero), por si el front manda el mismo día dos veces.
  select array_agg(distinct d order by d) into v_dias from unnest(p_dias) d;

  if p_hora_inicio is null or p_hora_fin is null or p_hora_fin <= p_hora_inicio then
    raise exception 'La hora de fin debe ser posterior a la hora de inicio';
  end if;

  if p_hora_fin >= time '24:00'
    or extract(second from p_hora_inicio) <> 0 or extract(second from p_hora_fin) <> 0 then
    raise exception 'Ingresá horarios entre 00:00 y 23:59, sin segundos';
  end if;

  -- Primero se revisan todos los días; recién si ninguno choca se inserta.
  -- Intervalos [inicio, fin): 09-12 y 12-14 son contiguos, no superpuestos.
  foreach v_dia in array v_dias loop
    select f.hora_inicio, f.hora_fin
    into v_choque
    from public.franja_profesional f
    where f.id_usuario = p_id_usuario
      and f.dia_semana = v_dia
      and f.hora_inicio < p_hora_fin
      and f.hora_fin > p_hora_inicio
    order by f.hora_inicio
    limit 1;

    if found then
      raise exception 'El % se superpone con la franja de % a %. No se guardó ningún día',
        v_nombres[v_dia],
        to_char(v_choque.hora_inicio, 'HH24:MI'),
        to_char(v_choque.hora_fin, 'HH24:MI');
    end if;
  end loop;

  insert into public.franja_profesional (id_usuario, dia_semana, hora_inicio, hora_fin)
  select p_id_usuario, d, p_hora_inicio, p_hora_fin
  from unnest(v_dias) d;

  return jsonb_build_object('creadas', cardinality(v_dias), 'dias', to_jsonb(v_dias));
exception when exclusion_violation then
  -- Última defensa (restricción franja_sin_superposicion). La excepción deshace todos los inserts.
  raise exception 'La franja se superpone con otro horario del mismo día. No se guardó ningún día';
end;
$$;

revoke all on function public.fn_registrar_franjas_profesional(uuid, integer[], time, time) from public, anon;
grant execute on function public.fn_registrar_franjas_profesional(uuid, integer[], time, time) to authenticated;

notify pgrst, 'reload schema';

commit;
