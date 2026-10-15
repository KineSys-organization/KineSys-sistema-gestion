"use server";

import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { HistorialOrdenes } from "@/lib/ordenes/tipos";
import { esUuid, validarFiltrosOrdenes, type FiltrosOrdenes } from "@/lib/ordenes/validar";

// HU-24B. Historial de órdenes médicas de un paciente (solo lectura).
// Gerente: cualquier paciente. Profesional: solo si tiene o tuvo un turno con él
// (lo decide la base con auth.uid(); el front no manda el id del profesional).
export async function listarOrdenesPaciente(
  idPaciente: string,
  filtros: FiltrosOrdenes
): Promise<{ data: HistorialOrdenes | null; error: string | null }> {
  const sinPermiso = await exigirAccion("ordenes.consultar");
  if (sinPermiso) return { data: null, error: sinPermiso };

  if (!esUuid(idPaciente)) return { data: null, error: "Paciente inválido" };

  const errorFiltros = validarFiltrosOrdenes(filtros);
  if (errorFiltros) return { data: null, error: errorFiltros };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_ordenes_paciente", {
    p_id_paciente: idPaciente.trim(),
    p_desde: filtros.desde || null,
    p_hasta: filtros.hasta || null,
    p_id_profesional: filtros.profesional || null,
  });

  if (error) return { data: null, error: error.message };

  const historial = data as HistorialOrdenes;
  return {
    data: {
      ...historial,
      ordenes: (historial.ordenes ?? []).map((o) => ({ ...o, fecha: String(o.fecha).slice(0, 10) })),
    },
    error: null,
  };
}
