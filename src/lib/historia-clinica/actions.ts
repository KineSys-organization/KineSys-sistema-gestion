"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CamposFicha, EstadoHistoria, HistoriaClinica } from "@/lib/historia-clinica/tipos";
import { CAMPOS_FICHA, esIdValido, urlHistoria, validarFicha } from "@/lib/historia-clinica/validar";

// HU-39. Historia clínica del paciente: ficha + evolución.
// El profesional no se manda: la base usa auth.uid() y exige un turno con el paciente.
export async function obtenerHistoriaClinica(idPaciente: string): Promise<{
  data: HistoriaClinica | null;
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("historia.consultar");
  if (sinPermiso) return { data: null, error: sinPermiso };

  if (!esIdValido(idPaciente)) return { data: null, error: "Paciente inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_obtener_historia_clinica", {
    p_id_paciente: idPaciente.trim(),
  });

  if (error) return { data: null, error: error.message };
  return { data: data as HistoriaClinica, error: null };
}

// HU-39. Crear o editar la ficha clínica. La base guarda la versión anterior.
export async function guardarHistoriaClinica(
  _prev: EstadoHistoria,
  formData: FormData
): Promise<EstadoHistoria> {
  const sinPermiso = await exigirAccion("historia.registrar");
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const idPaciente = String(formData.get("id_paciente") ?? "").trim();
  const idTurno = String(formData.get("id_turno") ?? "").trim();
  if (!esIdValido(idPaciente)) return { ok: false, error: "Paciente inválido" };

  const campos = Object.fromEntries(
    CAMPOS_FICHA.map((c) => [c.nombre, String(formData.get(c.nombre) ?? "")])
  ) as CamposFicha;
  const errorValidacion = validarFicha(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_guardar_historia_clinica", {
    p_id_paciente: idPaciente,
    p_antecedentes_personales: campos.antecedentes_personales?.trim() || null,
    p_antecedentes_quirurgicos: campos.antecedentes_quirurgicos?.trim() || null,
    p_alergias: campos.alergias?.trim() || null,
    p_medicacion_actual: campos.medicacion_actual?.trim() || null,
    p_diagnostico: campos.diagnostico?.trim() || null,
    p_observaciones_generales: campos.observaciones_generales?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/historia-clinica/${idPaciente}`);
  redirect(urlHistoria(idPaciente, { turno: idTurno, ok: "guardada" }));
}
