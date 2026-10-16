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

  // Con rango inválido igual se consulta (sin fechas) para que el combo de profesionales
  // no quede vacío; se devuelve el error y ningún turno.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_historial_paciente", {
    p_id_paciente: idPaciente.trim(),
    p_desde: errorFiltros ? null : filtros.desde,
    p_hasta: errorFiltros ? null : filtros.hasta,
    p_id_profesional: filtros.profesional,
    p_pagina: errorFiltros ? 1 : filtros.pagina,
  });

  if (error) return { data: null, error: errorFiltros ?? error.message };

  const cuerpo = data as HistorialPaciente;
  if (errorFiltros) return { data: { ...cuerpo, turnos: [] }, error: errorFiltros };

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
