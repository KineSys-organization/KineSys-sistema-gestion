"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirPacienteAccion } from "@/lib/portal/acceso";
import type { CalendarioDisponibilidad } from "@/lib/disponibilidad/calendario";
import type {
  EstadoAccionPortal,
  HorariosPortal,
  MisTurnos,
  ServicioPortal,
  TurnoPortal,
} from "@/lib/portal/tipos";
import { coberturaParaRpc, esUuid, validarSacarTurno } from "@/lib/portal/validar";

// HU-23. Server actions del portal del paciente. Cada una repite el chequeo de sesión
// (exigirPacienteAccion) y la base vuelve a exigir que sea un paciente activo.

export async function obtenerCatalogo(): Promise<{ data: ServicioPortal[]; error: string | null }> {
  const sinPermiso = await exigirPacienteAccion();
  if (sinPermiso) return { data: [], error: sinPermiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_paciente_catalogo");
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ServicioPortal[], error: null };
}

export async function obtenerCalendarioPortal(
  idProfesional: string,
  idServicio: string
): Promise<{ data: CalendarioDisponibilidad | null; error: string | null }> {
  const sinPermiso = await exigirPacienteAccion();
  if (sinPermiso) return { data: null, error: sinPermiso };
  if (!esUuid(idProfesional)) return { data: null, error: "Profesional inválido" };
  if (!esUuid(idServicio)) return { data: null, error: "Servicio inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_paciente_calendario", {
    p_id_profesional: idProfesional,
    p_id_servicio: idServicio,
  });
  if (error) return { data: null, error: error.message };

  const calendario = data as CalendarioDisponibilidad;
  return {
    data: {
      ...calendario,
      dias: (calendario.dias ?? []).map((d) => ({
        fecha: String(d.fecha).slice(0, 10),
        libres: Number(d.libres),
      })),
    },
    error: null,
  };
}

export async function obtenerHorariosPortal(
  idProfesional: string,
  idServicio: string,
  fecha: string
): Promise<{ data: HorariosPortal | null; error: string | null }> {
  const sinPermiso = await exigirPacienteAccion();
  if (sinPermiso) return { data: null, error: sinPermiso };
  if (!esUuid(idProfesional)) return { data: null, error: "Profesional inválido" };
  if (!esUuid(idServicio)) return { data: null, error: "Servicio inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_paciente_horarios", {
    p_id_profesional: idProfesional,
    p_id_servicio: idServicio,
    p_fecha: fecha,
  });
  if (error) return { data: null, error: error.message };

  const horarios = data as HorariosPortal;
  return {
    data: {
      ...horarios,
      horarios: Array.isArray(horarios.horarios) ? horarios.horarios.map(String) : [],
      mensaje: horarios.mensaje ?? null,
    },
    error: null,
  };
}

// Paso 4: confirmar. Si sale bien, va a "Mis turnos" con el aviso del turno nuevo.
export async function sacarTurno(
  _prev: EstadoAccionPortal,
  formData: FormData
): Promise<EstadoAccionPortal> {
  const sinPermiso = await exigirPacienteAccion();
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const campos = {
    id_profesional: String(formData.get("id_profesional") ?? ""),
    id_servicio: String(formData.get("id_servicio") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
    hora: String(formData.get("hora") ?? ""),
    cobertura: String(formData.get("cobertura") ?? ""),
  };

  const errorValidacion = validarSacarTurno(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_paciente_sacar_turno", {
    p_id_profesional: campos.id_profesional.trim(),
    p_id_servicio: campos.id_servicio.trim(),
    p_fecha: campos.fecha.trim(),
    p_hora: campos.hora.trim(),
    p_id_obra_social: coberturaParaRpc(campos.cobertura.trim()),
  });

  if (error) return { ok: false, error: error.message };

  const turno = data as TurnoPortal;
  redirect(`/portal?nuevo=${turno.id_turno}`);
}

export async function obtenerMisTurnos(): Promise<{ data: MisTurnos | null; error: string | null }> {
  const sinPermiso = await exigirPacienteAccion();
  if (sinPermiso) return { data: null, error: sinPermiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_paciente_mis_turnos");
  if (error) return { data: null, error: error.message };

  const turnos = data as MisTurnos;
  const normalizar = (t: TurnoPortal) => ({ ...t, fecha: String(t.fecha).slice(0, 10) });
  return {
    data: {
      proximos: (turnos.proximos ?? []).map(normalizar),
      anteriores: (turnos.anteriores ?? []).map(normalizar),
    },
    error: null,
  };
}

export async function cancelarTurnoPortal(
  _prev: EstadoAccionPortal,
  formData: FormData
): Promise<EstadoAccionPortal> {
  const sinPermiso = await exigirPacienteAccion();
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const idTurno = String(formData.get("id_turno") ?? "");
  if (!esUuid(idTurno)) return { ok: false, error: "Turno inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_paciente_cancelar_turno", { p_id_turno: idTurno });
  if (error) return { ok: false, error: error.message };

  redirect("/portal?cancelado=1");
}
