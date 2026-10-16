// HU-23. Turno online del paciente: validaciones y URLs del flujo.
// Lógica pura (sin Supabase ni Next) para poder testearla con `npm test`.
// Las reglas de verdad (quién es el paciente, horarios libres, cobertura) las decide la base.

const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
const HORA_OK = /^([01]\d|2[0-3]):[0-5]\d$/;

// Valor del radio de cobertura sin obra social (la base lo recibe como null).
export const PARTICULAR = "particular";

export const MENSAJE_NO_DISPONIBLE = "El horario seleccionado ya no está disponible";

// Pasos del portal: 1 servicio → 2 profesional → 3 día y horario → 4 confirmar.
export const PASOS_PORTAL = ["Servicio", "Profesional", "Día y horario", "Confirmar"] as const;

export type DatosPortal = {
  servicio?: string;
  profesional?: string;
  fecha?: string;
  hora?: string;
};

export function esUuid(valor: string | undefined): valor is string {
  return !!valor && UUID_OK.test(valor);
}

// Se queda solo con lo que tiene formato válido y en orden: sin servicio no hay profesional,
// sin profesional no hay fecha, sin fecha no hay hora (así un link roto vuelve al paso que falta).
export function limpiarDatos(datos: DatosPortal): DatosPortal {
  const limpio: DatosPortal = {};
  if (!esUuid(datos.servicio)) return limpio;
  limpio.servicio = datos.servicio;
  if (!esUuid(datos.profesional)) return limpio;
  limpio.profesional = datos.profesional;
  if (!datos.fecha || !FECHA_OK.test(datos.fecha)) return limpio;
  limpio.fecha = datos.fecha;
  if (!datos.hora || !HORA_OK.test(datos.hora)) return limpio;
  limpio.hora = datos.hora;
  return limpio;
}

// En qué paso está el paciente según lo que ya eligió.
export function pasoPortal(datos: DatosPortal): 1 | 2 | 3 | 4 {
  const d = limpiarDatos(datos);
  if (!d.servicio) return 1;
  if (!d.profesional) return 2;
  if (!d.hora) return 3;
  return 4;
}

// /portal/nuevo con lo elegido en la URL (así "Volver" y recargar no pierden nada).
export function urlPortalNuevo(datos: DatosPortal = {}): string {
  const d = limpiarDatos(datos);
  const params = new URLSearchParams();
  if (d.servicio) params.set("servicio", d.servicio);
  if (d.profesional) params.set("profesional", d.profesional);
  if (d.fecha) params.set("fecha", d.fecha);
  if (d.hora) params.set("hora", d.hora);
  const query = params.toString();
  return query ? `/portal/nuevo?${query}` : "/portal/nuevo";
}

export type CamposSacarTurno = {
  id_profesional: string;
  id_servicio: string;
  fecha: string;
  hora: string;
  cobertura: string;
};

export function validarSacarTurno(input: CamposSacarTurno, ahora: Date = new Date()): string | null {
  if (!esUuid(input.id_servicio.trim())) return "Elegí un servicio";
  if (!esUuid(input.id_profesional.trim())) return "Elegí un profesional";
  if (!FECHA_OK.test(input.fecha.trim()) || !HORA_OK.test(input.hora.trim())) {
    return "Elegí el día y el horario";
  }

  // La fecha y la hora del turno son de Argentina (UTC-3, sin horario de verano). Sin el
  // offset se leerían en la zona del servidor (UTC en producción) y se rechazarían los
  // turnos de las próximas 3 horas.
  const inicio = new Date(`${input.fecha.trim()}T${input.hora.trim()}:00-03:00`);
  if (Number.isNaN(inicio.getTime())) return "La fecha no es válida";
  if (inicio < ahora) return "No se pueden sacar turnos en una fecha u hora pasada";

  const cobertura = input.cobertura.trim();
  if (!cobertura) return "Elegí con qué cobertura te atendés";
  if (cobertura !== PARTICULAR && !esUuid(cobertura)) return "Cobertura inválida";

  return null;
}

export function coberturaParaRpc(valor: string): string | null {
  return valor === PARTICULAR ? null : valor;
}

// Una sola obra social: preseleccionada. Ninguna: Particular. Varias: el paciente elige.
export function coberturaInicial(obras: { id_obra_social: string }[]): string {
  if (obras.length === 1) return obras[0].id_obra_social;
  if (obras.length === 0) return PARTICULAR;
  return "";
}

// "12500" -> "$ 12.500,00" (precio de referencia del servicio).
export function formatearPrecio(valor: number | string | null | undefined): string | null {
  const numero = Number(valor);
  if (valor === null || valor === undefined || valor === "" || !Number.isFinite(numero)) return null;
  return `$ ${new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numero)}`;
}

export const ETIQUETAS_ESTADO: Record<string, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  ausente: "Ausente",
  atendido: "Atendido",
};
