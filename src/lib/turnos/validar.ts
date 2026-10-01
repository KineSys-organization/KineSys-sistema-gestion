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

// Una obra inactiva se conserva en el paciente, pero no se ofrece como cobertura.
export function obrasActivasParaCobertura(obras: ObraSocialPaciente[]): ObraSocialPaciente[] {
  return obras.filter((obra) => obra.activo !== false);
}

// Una sola obra activa: se preselecciona. Ninguna: Particular. Varias: Recepción elige.
export function coberturaInicial(obras: ObraSocialPaciente[]): string {
  const activas = obrasActivasParaCobertura(obras);
  if (activas.length === 1) return activas[0].id_obra_social;
  if (activas.length === 0) return PARTICULAR;
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

// HU-10A. Motivos de cancelación: el valor es el que guarda la base.
export const MOTIVOS_CANCELACION = [
  { valor: "pedido_paciente", etiqueta: "A pedido del paciente" },
  { valor: "profesional", etiqueta: "Por el profesional" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export const LARGO_MAXIMO_DETALLE = 200;

export type CamposCancelacion = {
  idTurno: string;
  motivo: string;
  detalle: string;
};

export function validarCancelacion(input: CamposCancelacion): string | null {
  if (!UUID_OK.test(input.idTurno.trim())) return "Turno inválido";

  const motivo = input.motivo.trim();
  if (!motivo) return "Tenés que indicar el motivo de la cancelación";
  if (!MOTIVOS_CANCELACION.some((m) => m.valor === motivo)) {
    return "El motivo de cancelación no es válido";
  }

  if (input.detalle.trim().length > LARGO_MAXIMO_DETALLE) {
    return "El detalle no puede superar los 200 caracteres";
  }

  return null;
}

// "pedido_paciente" -> "A pedido del paciente". Si no lo conoce, lo deja igual.
export function etiquetaMotivo(valor: string | null): string {
  const motivo = MOTIVOS_CANCELACION.find((m) => m.valor === valor);
  return motivo ? motivo.etiqueta : (valor ?? "");
}

// HU-10C. Reprogramar: solo cambian fecha y hora. Las reglas (estado, que no haya
// empezado, que el horario siga libre) las valida fn_reprogramar_turno.
export type CamposReprogramar = {
  idTurno: string;
  fecha: string;
  hora: string;
};

export function validarReprogramacion(input: CamposReprogramar): string | null {
  if (!UUID_OK.test(input.idTurno.trim())) return "Turno inválido";
  if (!input.fecha.trim() || !input.hora.trim()) return "Elegí el nuevo día y horario";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha.trim())) return "La fecha no es válida";
  if (!HORA_OK.test(input.hora.trim())) return "La hora no es válida";

  const dia = new Date(`${input.fecha.trim()}T00:00:00Z`);
  if (Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== input.fecha.trim()) {
    return "La fecha no es válida";
  }

  return null;
}

// URL de la pantalla de reprogramar conservando el día y el horario elegidos.
export function urlReprogramar(
  idTurno: string,
  campos: { fecha?: string; hora?: string } = {}
): string {
  const params = new URLSearchParams();
  if (campos.fecha) params.set("fecha", campos.fecha);
  if (campos.hora) params.set("hora", campos.hora);
  const query = params.toString();
  return `/turnos/${idTurno}/reprogramar${query ? `?${query}` : ""}`;
}

// HU-25. Repetir un turno semanalmente: mismo día de la semana y misma hora.
// Las reglas (turno confirmado con paciente, franjas, ocupación) las valida la base.
export const MAXIMO_SEMANAS_REPETIR = 24;

export type CamposRepetir = {
  idTurno: string;
  semanas: string;
};

export function validarRepetir(input: CamposRepetir): string | null {
  if (!UUID_OK.test(input.idTurno.trim())) return "Turno inválido";

  const semanas = input.semanas.trim();
  if (!semanas) return "Indicá cuántas semanas repetir";
  if (!/^\d+$/.test(semanas)) return "La cantidad de semanas tiene que ser un número entero";

  const numero = Number(semanas);
  if (numero < 1 || numero > MAXIMO_SEMANAS_REPETIR) {
    return "Podés repetir el turno entre 1 y 24 semanas";
  }

  return null;
}
