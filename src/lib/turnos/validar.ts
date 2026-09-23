import type { ObraSocialPaciente } from "../pacientes/tipos";

const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HORA_OK = /^([01]\d|2[0-3]):[0-5]\d$/;

// Valor del radio de cobertura cuando el paciente se atiende sin obra social.
export const PARTICULAR = "particular";

export const MENSAJE_NO_DISPONIBLE = "El horario seleccionado ya no está disponible";

export type CamposTurno = {
  id_paciente: string;
  id_profesional: string;
  id_servicio: string;
  fecha: string;
  hora: string;
  cobertura: string;
};

export function validarOtorgarTurno(input: CamposTurno): string | null {
  if (!input.id_paciente.trim()) return "Elegí un paciente";
  if (!UUID_OK.test(input.id_paciente.trim())) return "Paciente inválido";
  if (!UUID_OK.test(input.id_profesional.trim())) return "Profesional inválido";
  if (!UUID_OK.test(input.id_servicio.trim())) return "Servicio inválido";
  if (!input.fecha.trim() || !input.hora.trim()) return "Faltan la fecha o la hora";
  if (!HORA_OK.test(input.hora.trim())) return "La hora no es válida";

  const inicio = new Date(`${input.fecha}T${input.hora}:00`);
  if (Number.isNaN(inicio.getTime())) return "La fecha no es válida";
  if (inicio < new Date()) {
    return "No se pueden otorgar turnos con fecha anterior a la actual";
  }

  const cobertura = input.cobertura.trim();
  if (!cobertura) return "Elegí con qué cobertura se atiende";
  if (cobertura !== PARTICULAR && !UUID_OK.test(cobertura)) {
    return "Cobertura inválida";
  }

  return null;
}

export function esIdTurno(id: string): boolean {
  return UUID_OK.test(id);
}

// Una sola obra: se preselecciona. Ninguna: Particular. Varias: Recepción elige.
export function coberturaInicial(obras: ObraSocialPaciente[]): string {
  if (obras.length === 1) return obras[0].id_obra_social;
  if (obras.length === 0) return PARTICULAR;
  return "";
}

// "2026-09-28" -> "lunes, 28 de septiembre de 2026" (para el resumen).
export function formatearFecha(fecha: string): string {
  const dia = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(dia.getTime())) return fecha;
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dia);
}

// La base guarda Particular como null.
export function coberturaParaRpc(valor: string): string | null {
  return valor === PARTICULAR ? null : valor;
}
