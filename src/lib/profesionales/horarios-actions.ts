"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { esIdProfesional, validarCamposFranja } from "./horarios";
import type { EstadoFranja, HorariosProfesional } from "./horarios";

export async function consultarHorarios(id: string): Promise<{
  data: HorariosProfesional | null;
  error: string | null;
}> {
  if (!esIdProfesional(id)) return { data: null, error: "Profesional inválido" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_horarios_profesional", { p_id_usuario: id });
  return { data: error ? null : data as HorariosProfesional, error: error?.message ?? null };
}

export async function registrarFranja(
  id: string,
  _prev: EstadoFranja,
  formData: FormData,
): Promise<EstadoFranja> {
  const campos = {
    dia_semana: String(formData.get("dia_semana") ?? ""),
    hora_inicio: String(formData.get("hora_inicio") ?? ""),
    hora_fin: String(formData.get("hora_fin") ?? ""),
  };
  if (!esIdProfesional(id)) return { ok: false, error: "Profesional inválido", campos };
  const errorValidacion = validarCamposFranja(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion, campos };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_franja_profesional", {
    p_id_usuario: id,
    p_dia_semana: Number(campos.dia_semana),
    p_hora_inicio: campos.hora_inicio,
    p_hora_fin: campos.hora_fin,
  });
  if (error) return { ok: false, error: error.message, campos };
  revalidatePath(`/profesionales/${id}/horarios`);
  revalidatePath("/disponibilidad");
  revalidatePath("/profesionales");
  return { ok: true, error: null };
}

export async function editarFranja(
  idProfesional: string,
  idFranja: string,
  _prev: EstadoFranja,
  formData: FormData,
): Promise<EstadoFranja> {
  const campos = {
    dia_semana: String(formData.get("dia_semana") ?? ""),
    hora_inicio: String(formData.get("hora_inicio") ?? ""),
    hora_fin: String(formData.get("hora_fin") ?? ""),
  };
  if (!esIdProfesional(idProfesional) || !esIdProfesional(idFranja)) return { ok: false, error: "Profesional o franja inválidos", campos };
  const errorValidacion = validarCamposFranja(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion, campos };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_editar_franja_profesional", {
    p_id_franja: idFranja,
    p_solo_consultar: formData.get("confirmar") !== "si",
    p_dia_semana: Number(campos.dia_semana),
    p_hora_inicio: campos.hora_inicio,
    p_hora_fin: campos.hora_fin,
  });
  if (error) return { ok: false, error: error.message, campos };
  if (!data.guardado) return { ok: false, error: null, campos, turnos: data.turnos, requiereConfirmacion: true };
  revalidatePath("/profesionales/" + idProfesional + "/horarios");
  revalidatePath("/disponibilidad");
  return { ok: true, error: null, turnos: data.turnos };
}

export async function eliminarFranja(
  idProfesional: string,
  idFranja: string,
  confirmar = false,
): Promise<EstadoFranja> {
  if (!esIdProfesional(idProfesional) || !esIdProfesional(idFranja)) return { ok: false, error: "Profesional o franja inválidos" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_eliminar_franja_profesional", {
    p_id_franja: idFranja,
    p_solo_consultar: !confirmar,
  });
  if (error) return { ok: false, error: error.message };
  if (!data.guardado) return { ok: false, error: null, turnos: data.turnos, requiereConfirmacion: true };
  revalidatePath("/profesionales/" + idProfesional + "/horarios");
  revalidatePath("/disponibilidad");
  revalidatePath("/profesionales");
  return { ok: true, error: null, turnos: data.turnos };
}
