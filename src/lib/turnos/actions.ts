"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EstadoOtorgar, Turno } from "@/lib/turnos/tipos";
import {
  coberturaParaRpc,
  esIdTurno,
  validarOtorgarTurno,
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
