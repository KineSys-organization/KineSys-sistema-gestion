"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAccion, obtenerUsuarioGestion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EstadoAtencion, MiAgenda } from "@/lib/atencion/tipos";
import type { TurnoAgenda } from "@/lib/agenda/tipos";
import type { Turno } from "@/lib/turnos/tipos";
import {
  esIdTurnoValido,
  validarAtencion,
  validarFechaAgenda,
} from "@/lib/atencion/validar";

// HU-12. Agenda del profesional logueado.
// El id del profesional sale de la sesión, nunca del request. Igual, la base
// (fn_consultar_agenda_profesional) rechaza a un Profesional que pida otro id.
export async function consultarMiAgenda(fecha: string): Promise<{
  data: MiAgenda | null;
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("atencion.agenda");
  if (sinPermiso) return { data: null, error: sinPermiso };

  const errorValidacion = validarFechaAgenda(fecha);
  if (errorValidacion) return { data: null, error: errorValidacion };

  const usuario = await obtenerUsuarioGestion();
  if (!usuario) return { data: null, error: "Tu sesión expiró. Volvé a iniciar sesión" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_agenda_profesional", {
    p_id_profesional: usuario.id_usuario,
    p_fecha: fecha.trim(),
  });

  if (error) return { data: null, error: error.message };

  const turnos = (Array.isArray(data) ? data : []) as TurnoAgenda[];
  return { data: { fecha: fecha.trim(), turnos }, error: null };
}

// HU-12. Un turno de la agenda propia con los datos del paciente (y la atención, si hay).
// Si el turno es de otro profesional, fn_obtener_turno lo rechaza.
export async function obtenerMiTurno(id: string): Promise<{
  data: Turno | null;
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("atencion.agenda");
  if (sinPermiso) return { data: null, error: sinPermiso };

  if (!esIdTurnoValido(id)) return { data: null, error: "Turno inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_obtener_turno", {
    p_id_turno: id.trim(),
  });

  if (error) return { data: null, error: error.message };

  const turno = data as Turno;
  return {
    data: { ...turno, fecha: String(turno.fecha).slice(0, 10) },
    error: null,
  };
}

function camposDesde(formData: FormData) {
  return {
    idTurno: String(formData.get("id_turno") ?? ""),
    observaciones: String(formData.get("observaciones") ?? ""),
    motivo: String(formData.get("motivo_consulta") ?? ""),
    orden: String(formData.get("orden_medica") ?? ""),
  };
}

// La agenda propia y la de Recepción muestran el nuevo estado.
function refrescarAgendas(idTurno: string) {
  revalidatePath("/mi-agenda");
  revalidatePath(`/mi-agenda/${idTurno}`);
  revalidatePath("/agenda");
  revalidatePath(`/turnos/${idTurno}`);
}

// HU-13. Registrar la atención: la base valida que el turno sea propio, confirmado,
// del día y no atendido; guarda fecha, profesional, paciente (del turno),
// observaciones, motivo y orden médica (HU-24A, opcional), y pasa el turno a 'atendido'.
export async function registrarAtencion(
  _prev: EstadoAtencion,
  formData: FormData
): Promise<EstadoAtencion> {
  const sinPermiso = await exigirAccion("atencion.registrar");
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const campos = camposDesde(formData);
  const errorValidacion = validarAtencion(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const idTurno = campos.idTurno.trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_atencion", {
    p_id_turno: idTurno,
    p_observaciones: campos.observaciones.trim(),
    p_motivo_consulta: campos.motivo.trim() || null,
    // HU-24A: vacía = sin orden (la base también la normaliza a null).
    p_orden_medica: campos.orden.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  refrescarAgendas(idTurno);
  redirect(`/mi-agenda/${idTurno}?ok=registrada`);
}

// HU-13. Edición explícita de una atención ya registrada (observaciones, motivo
// y, desde HU-24A, la orden médica).
export async function editarAtencion(
  _prev: EstadoAtencion,
  formData: FormData
): Promise<EstadoAtencion> {
  const sinPermiso = await exigirAccion("atencion.registrar");
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const campos = camposDesde(formData);
  const errorValidacion = validarAtencion(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const idTurno = campos.idTurno.trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_atencion", {
    p_id_turno: idTurno,
    p_observaciones: campos.observaciones.trim(),
    p_motivo_consulta: campos.motivo.trim() || null,
    // HU-24A: vacía = sin orden (la base también la normaliza a null).
    p_orden_medica: campos.orden.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  refrescarAgendas(idTurno);
  redirect(`/mi-agenda/${idTurno}?ok=editada`);
}
