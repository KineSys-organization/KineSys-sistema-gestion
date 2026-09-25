"use server";

import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profesional } from "@/lib/profesionales/tipos";
import type { Agenda, EstadoAgenda } from "@/lib/agenda/tipos";
import { validarConsultaAgenda } from "@/lib/agenda/validar";

export async function listarProfesionalesParaAgenda(): Promise<{
  data: Profesional[];
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("agenda.consultar");
  if (sinPermiso) return { data: [], error: sinPermiso };

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

// La pantalla /agenda lee profesional y fecha de la URL (así se puede linkear
// desde el resumen del turno y "Volver" conserva el día).
export async function obtenerAgenda(campos: {
  id_profesional: string;
  fecha: string;
}): Promise<EstadoAgenda> {
  const sinPermiso = await exigirAccion("agenda.consultar");
  if (sinPermiso) return { ok: false, error: sinPermiso, data: null };

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
