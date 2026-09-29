"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  EstadoAccionTurno,
  EstadoCancelar,
  EstadoOtorgar,
  Turno,
} from "@/lib/turnos/tipos";
import {
  coberturaParaRpc,
  esIdTurno,
  validarCancelacion,
  validarOtorgarTurno,
  validarReprogramacion,
} from "@/lib/turnos/validar";

export async function otorgarTurno(
  _prev: EstadoOtorgar,
  formData: FormData
): Promise<EstadoOtorgar> {
  const sinPermiso = await exigirAccion("turnos.gestionar");
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const campos = {
    id_paciente: String(formData.get("id_paciente") ?? ""),
    id_profesional: String(formData.get("id_profesional") ?? ""),
    id_servicio: String(formData.get("id_servicio") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
    hora: String(formData.get("hora") ?? ""),
    cobertura: String(formData.get("cobertura") ?? ""),
  };

  const errorValidacion = validarOtorgarTurno(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  // La base vuelve a validar el horario al confirmar (concurrencia).
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_otorgar_turno", {
    p_id_paciente: campos.id_paciente,
    p_id_profesional: campos.id_profesional,
    p_id_servicio: campos.id_servicio,
    p_fecha: campos.fecha,
    p_hora: campos.hora,
    p_id_obra_social: coberturaParaRpc(campos.cobertura),
  });

  if (error) return { ok: false, error: error.message };

  const turno = data as Turno;
  revalidatePath("/disponibilidad");
  redirect(`/turnos/${turno.id_turno}`);
}

export async function obtenerTurno(id: string): Promise<{
  data: Turno | null;
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("turnos.gestionar");
  if (sinPermiso) return { data: null, error: sinPermiso };

  if (!esIdTurno(id)) {
    return { data: null, error: "Turno inválido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_obtener_turno", {
    p_id_turno: id,
  });

  if (error) return { data: null, error: error.message };

  const turno = data as Turno;
  return {
    data: { ...turno, fecha: String(turno.fecha).slice(0, 10) },
    error: null,
  };
}

// HU-10A. Cancelar un turno con motivo. Las reglas (estado, "ya pasó", permisos)
// las valida fn_cancelar_turno; acá solo se revisan los parámetros.
export async function cancelarTurno(
  _prev: EstadoCancelar,
  formData: FormData
): Promise<EstadoCancelar> {
  const sinPermiso = await exigirAccion("turnos.cancelar");
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const campos = {
    idTurno: String(formData.get("id_turno") ?? ""),
    motivo: String(formData.get("motivo") ?? ""),
    detalle: String(formData.get("detalle") ?? ""),
  };

  const errorValidacion = validarCancelacion(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cancelar_turno", {
    p_id_turno: campos.idTurno.trim(),
    p_motivo: campos.motivo.trim(),
    p_detalle: campos.detalle.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  // El turno cambió de estado, la agenda lo muestra cancelado y el horario queda libre.
  revalidatePath(`/turnos/${campos.idTurno.trim()}`);
  revalidatePath("/agenda");
  revalidatePath("/disponibilidad");
  return { ok: true, error: null };
}

// HU-10B. Marcar ausencia y corregirla. Sin motivo: solo el id del turno.
// Las reglas (estado, sin atención, ya terminó) las valida la fn_*.
async function cambiarAusencia(
  rpc: "fn_marcar_ausente" | "fn_corregir_ausencia",
  formData: FormData
): Promise<EstadoAccionTurno> {
  const idTurno = String(formData.get("id_turno") ?? "").trim();
  if (!esIdTurno(idTurno)) return { ok: false, error: "Turno inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { p_id_turno: idTurno });
  if (error) return { ok: false, error: error.message };

  // El estado nuevo se ve en el detalle, la agenda y el listado de turnos (HU-09).
  revalidatePath(`/turnos/${idTurno}`);
  revalidatePath("/turnos");
  revalidatePath("/agenda");
  return { ok: true, error: null };
}

export async function marcarAusente(
  _prev: EstadoAccionTurno,
  formData: FormData
): Promise<EstadoAccionTurno> {
  const sinPermiso = await exigirAccion("turnos.ausente");
  if (sinPermiso) return { ok: false, error: sinPermiso };
  return cambiarAusencia("fn_marcar_ausente", formData);
}

export async function corregirAusencia(
  _prev: EstadoAccionTurno,
  formData: FormData
): Promise<EstadoAccionTurno> {
  const sinPermiso = await exigirAccion("turnos.ausente");
  if (sinPermiso) return { ok: false, error: sinPermiso };
  return cambiarAusencia("fn_corregir_ausencia", formData);
}

// HU-10C. Reprogramar: actualiza el mismo turno. La base revalida el horario al
// confirmar (lock + disponibilidad sin contar a este turno).
export async function reprogramarTurno(
  _prev: EstadoAccionTurno,
  formData: FormData
): Promise<EstadoAccionTurno> {
  const sinPermiso = await exigirAccion("turnos.reprogramar");
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const campos = {
    idTurno: String(formData.get("id_turno") ?? "").trim(),
    fecha: String(formData.get("fecha") ?? "").trim(),
    hora: String(formData.get("hora") ?? "").trim(),
  };

  const errorValidacion = validarReprogramacion(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reprogramar_turno", {
    p_id_turno: campos.idTurno,
    p_fecha: campos.fecha,
    p_hora: campos.hora,
  });

  if (error) return { ok: false, error: error.message };

  // Cambió el horario: se libera el anterior y se ocupa el nuevo.
  revalidatePath(`/turnos/${campos.idTurno}`);
  revalidatePath("/turnos");
  revalidatePath("/agenda");
  revalidatePath("/disponibilidad");
  redirect(`/turnos/${campos.idTurno}?reprogramado=1`);
}
