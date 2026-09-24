"use server";

import { createClient } from "@/lib/supabase/server";
import type { Profesional } from "@/lib/profesionales/tipos";
import type { Agenda, EstadoAgenda } from "@/lib/agenda/tipos";
import { validarConsultaAgenda } from "@/lib/agenda/validar";

export async function listarProfesionalesParaAgenda(): Promise<{
  data: Profesional[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_profesionales");

  if (error) return { data: [], error: error.message };

  const activos = ((data ?? []) as Profesional[]).filter((p) => p.activo);
  return { data: activos, error: null };
}

function normalizar(data: unknown, campos: { id_profesional: string; fecha: string }): Agenda {
  const turnos = Array.isArray(data) ? data : [];
  return {
    id_profesional: campos.id_profesional,
    fecha: campos.fecha,
    turnos: turnos as Agenda["turnos"],
  };
}

export async function consultarAgenda(
  _prev: EstadoAgenda,
  formData: FormData
): Promise<EstadoAgenda> {
  const campos = {
    id_profesional: String(formData.get("id_profesional") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
  };
  const errorValidacion = validarConsultaAgenda(campos);

  if (errorValidacion) return { ok: false, error: errorValidacion, data: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_agenda_profesional", {
    p_id_profesional: campos.id_profesional,
    p_fecha: campos.fecha,
  });

  if (error) return { ok: false, error: error.message, data: null };

  return { ok: true, error: null, data: normalizar(data, campos) };
}
