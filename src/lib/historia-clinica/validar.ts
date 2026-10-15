// HU-39. Validaciones de la ficha clínica (sin Supabase ni Next, para `npm test`).
// Quién puede verla (un turno con el paciente) lo valida la base.
import type { CamposFicha } from "@/lib/historia-clinica/tipos";

const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Mismo límite que el check de la tabla historia_clinica (migración 024).
export const LARGO_MAXIMO_CAMPO_FICHA = 1000;

// Campos de la ficha en el orden en que se muestran.
export const CAMPOS_FICHA: { nombre: keyof CamposFicha; etiqueta: string; ayuda: string }[] = [
  {
    nombre: "diagnostico",
    etiqueta: "Diagnóstico principal / motivo del tratamiento",
    ayuda: "Ej.: lumbalgia mecánica, rehabilitación post esguince de tobillo",
  },
  {
    nombre: "antecedentes_personales",
    etiqueta: "Antecedentes personales",
    ayuda: "Enfermedades, hábitos, actividad física...",
  },
  {
    nombre: "antecedentes_quirurgicos",
    etiqueta: "Antecedentes quirúrgicos y traumatológicos",
    ayuda: "Cirugías, fracturas, lesiones previas...",
  },
  { nombre: "alergias", etiqueta: "Alergias", ayuda: "Medicamentos, materiales, alimentos..." },
  { nombre: "medicacion_actual", etiqueta: "Medicación actual", ayuda: "Qué toma y en qué dosis" },
  {
    nombre: "observaciones_generales",
    etiqueta: "Observaciones generales",
    ayuda: "Cualquier dato útil para quien lo atienda",
  },
];

export function esIdValido(id: string): boolean {
  return UUID_OK.test(id.trim());
}

// Todos opcionales, pero tiene que quedar al menos uno con texto (como la base).
export function validarFicha(campos: CamposFicha): string | null {
  const valores = Object.values(campos).map((v) => (v ?? "").trim());
  if (valores.some((v) => v.length > LARGO_MAXIMO_CAMPO_FICHA)) {
    return "Cada campo de la historia clínica puede tener hasta 1000 caracteres";
  }
  if (valores.every((v) => v === "")) {
    return "Completá al menos un campo de la historia clínica";
  }
  return null;
}

// "2026-10-05T13:32:00+00:00" -> "05/10/2026 10:32" (hora de Argentina).
export function formatearMomento(valor: string): string {
  const momento = new Date(valor);
  if (Number.isNaN(momento.getTime())) return valor;
  const partes = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).formatToParts(momento);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")}/${parte("year")} ${parte("hour")}:${parte("minute")}`;
}

// /historia-clinica/[paciente], recordando desde qué turno se abrió (para "Volver al turno").
export function urlHistoria(
  idPaciente: string,
  extra: { turno?: string | null; editar?: boolean; ok?: string } = {}
): string {
  const params = new URLSearchParams();
  if (extra.turno && esIdValido(extra.turno)) params.set("turno", extra.turno);
  if (extra.editar) params.set("editar", "1");
  if (extra.ok) params.set("ok", extra.ok);
  const query = params.toString();
  return `/historia-clinica/${idPaciente}${query ? `?${query}` : ""}`;
}
