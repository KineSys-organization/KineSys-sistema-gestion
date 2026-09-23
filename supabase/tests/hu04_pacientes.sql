-- Pruebas HU-04 sobre el esquema extendido. Ejecutar con sesión Gerente/Mesa; se revierte.
begin;

do $$
declare
  v_obra1 uuid;
  v_obra2 uuid;
  v_id uuid;
  v_json jsonb;
  v_count int;
begin
  if not public.fn_es_recepcion() then
    raise exception 'Estas pruebas requieren sesión de Gerente o Mesa de Entradas';
  end if;

  select id_obra_social into v_obra1 from public.obra_social order by nombre_obra_social limit 1;
  select id_obra_social into v_obra2 from public.obra_social order by nombre_obra_social offset 1 limit 1;

  if v_obra1 is null or v_obra2 is null then
    raise exception 'Falta el catálogo de obras sociales';
  end if;

  v_id := public.fn_registrar_paciente(
    'Lucía', 'TestHU04', 99001001, date '1995-01-15',
    '1100000000', 'lucia.hu04@test.com', '[]'::jsonb
  );

  select count(*) into v_count from public.fn_buscar_pacientes('99001001');
  if v_count <> 1 then raise exception 'Buscar por DNI falló'; end if;

  select count(*) into v_count from public.fn_buscar_pacientes('TestHU04');
  if v_count < 1 then raise exception 'Buscar por nombre falló'; end if;

  begin
    perform public.fn_registrar_paciente(
      'Otra', 'Persona', 99001001, date '1990-01-01',
      '1100000001', 'otra.hu04@test.com', '[]'::jsonb
    );
    raise exception 'Debió rechazar DNI duplicado';
  exception when others then
    if sqlerrm not like 'Ya existe un paciente con ese DNI%' then
      raise;
    end if;
  end;

  perform public.fn_editar_paciente(
    v_id, 'Lucía', 'TestHU04', '1100000000', 'lucia.hu04@test.com',
    jsonb_build_array(
      jsonb_build_object('id_obra_social', v_obra1, 'numero_afiliado', 'A-1'),
      jsonb_build_object('id_obra_social', v_obra2, 'numero_afiliado', 'B-2')
    )
  );

  v_json := public.fn_obtener_paciente(v_id);
  if jsonb_array_length(v_json -> 'obras_sociales') <> 2 then
    raise exception 'Debió guardar dos obras sociales';
  end if;

  -- Columna legacy sincronizada
  if (select obra_social from public.paciente where id_paciente = v_id) is null then
    raise exception 'Debió sincronizar obra_social legacy';
  end if;

  begin
    perform public.fn_editar_paciente(
      v_id, 'Lucía', 'TestHU04', '1100000000', 'lucia.hu04@test.com',
      jsonb_build_array(
        jsonb_build_object('id_obra_social', v_obra1, 'numero_afiliado', 'A-1'),
        jsonb_build_object('id_obra_social', v_obra1, 'numero_afiliado', 'A-2')
      )
    );
    raise exception 'Debió rechazar obra duplicada';
  exception when others then
    if sqlerrm not like 'No se puede asociar la misma obra social dos veces%' then
      raise;
    end if;
  end;

  -- Web pacientes intacta
  if to_regprocedure('public.fn_completar_registro_paciente(text,text,integer,date,text,text)') is null then
    raise exception 'Se rompió fn_completar_registro_paciente';
  end if;

  raise notice 'HU-04 OK';
end;
$$;

rollback;
