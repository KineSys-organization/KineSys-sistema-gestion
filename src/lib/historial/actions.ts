"use server";

import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FiltrosHistorial, HistorialPaciente } from "@/lib/historial/tipos";
import { esIdValido, validarFiltrosHistorial } from "@/lib/historial/validar";

// HU-16. Historial del paciente (administrativo o clínico según el rol).
export async function consultarHistorialPaciente(
  idPaciente: string,
  filtros: FiltrosHistorial
): Promise<{ data: HistorialPaciente | null; error: string | null }> {
  const sinPermiso = await exigirAccion("historial.consultar");
  if (sinPermiso) return { data: null, error: sinPermiso };

  if (!esIdValido(idPaciente)) return { data: null, error: "Paciente inválido" };

  const errorFiltros = validarFiltrosHistorial(filtros);
  if (errorFiltros) return { data: null, error: errorFiltros };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_historial_paciente", {
    p_id_paciente: idPaciente.trim(),
    p_desde: filtros.desde,
    p_hasta: filtros.hasta,
    p_id_profesional: filtros.profesional,
    p_pagina: filtros.pagina,
  });

  if (error) return { data: null, error: error.message };

  const cuerpo = data as HistorialPaciente;
  return {
    data: {
      ...cuerpo,
      turnos: (cuerpo.turnos ?? []).map((t) => ({
        ...t,
        fecha: String(t.fecha).slice(0, 10),
      })),
    },
    error: null,
  };
}
