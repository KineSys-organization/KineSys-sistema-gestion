// HU-12 / HU-13. Validaciones de parámetros del front (sin Supabase ni Next, para `npm test`).
// Las reglas de negocio (turno propio, del día, no atendido) las valida la base.

const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;

// Mismos límites que los check de la tabla atencion (migraciones 010 y 019).
export const LARGO_MAXIMO_OBSERVACIONES = 2000;
export const LARGO_MAXIMO_MOTIVO_CONSULTA = 200;
export const LARGO_MAXIMO_ORDEN_MEDICA = 2000; // HU-24A (desde HU-38: el detalle de la orden)
// HU-38: cantidad de sesiones de la orden (check de la migración 025).
export const SESIONES_MINIMAS = 1;
export const SESIONES_MAXIMAS = 50;

const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

// "Hoy" en Argentina como "YYYY-MM-DD" (la base usa la misma zona).
// Sin esto, el servidor en UTC cambiaría de día a las 21 hs.
export function hoyArgentina(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_ARGENTINA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

// "2026-09-24" + dias -> otra fecha "YYYY-MM-DD" (para "día anterior / siguiente").
export function sumarDias(fecha: string, dias: number): string {
  const dia = new Date(`${fecha}T00:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + dias);
  return dia.toISOString().slice(0, 10);
}

// true si es una fecha real con formato YYYY-MM-DD (rechaza "2026-02-30").
export function esFechaValida(fecha: string): boolean {
  if (!FECHA_OK.test(fecha)) return false;
  const dia = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === fecha;
}

export function validarFechaAgenda(fecha: string): string | null {
  if (!fecha.trim()) return "Elegí una fecha";
  if (!esFechaValida(fecha.trim())) return "La fecha no es válida";
  return null;
}

export function esIdTurnoValido(id: string): boolean {
  return UUID_OK.test(id.trim());
}

export type CamposAtencion = {
  idTurno: string;
  observaciones: string;
  motivo: string;
  // HU-24A: opcional (sin orden = vacío o no viene). Desde HU-38 es el detalle.
  orden?: string;
  // HU-38: cantidad de sesiones como viene del formulario ("" = sin informar).
  sesiones?: string;
  // HU-38: detalle de una orden vieja (HU-24A, sin sesiones). Si no se cambia, se puede
  // seguir guardando sin sesiones. La base lo vuelve a controlar con lo guardado.
  ordenVieja?: string | null;
};

// HU-38: "10" -> 10. null si está vacío. NaN si no es un entero.
export function leerSesiones(texto: string | undefined): number | null {
  const limpio = (texto ?? "").trim();
  if (!limpio) return null;
  return /^\d+$/.test(limpio) ? Number(limpio) : Number.NaN;
}

// HU-38. La orden es opcional; si se carga, van las dos cosas (sesiones y detalle).
// Mismo orden de controles y mensajes que fn_registrar_atencion / fn_editar_atencion.
export function validarOrden(input: CamposAtencion): string | null {
  const detalle = (input.orden ?? "").trim();
  const sesiones = leerSesiones(input.sesiones);
  const esVieja =
    input.ordenVieja != null && detalle !== "" && detalle === input.ordenVieja.trim();

  if (detalle && sesiones === null && !esVieja) return "Indicá la cantidad de sesiones";
  if (!detalle && sesiones !== null) return "Completá el detalle de la orden";
  if (
    sesiones !== null &&
    (!Number.isInteger(sesiones) || sesiones < SESIONES_MINIMAS || sesiones > SESIONES_MAXIMAS)
  ) {
    return "La cantidad de sesiones tiene que ser entre 1 y 50";
  }
  if (detalle.length > LARGO_MAXIMO_ORDEN_MEDICA) {
    return "La orden médica no puede superar los 2000 caracteres";
  }
  return null;
}

// Registrar y editar validan lo mismo.
export function validarAtencion(input: CamposAtencion): string | null {
  if (!esIdTurnoValido(input.idTurno)) return "Turno inválido";

  const observaciones = input.observaciones.trim();
  if (!observaciones) return "Tenés que escribir las observaciones de la atención";
  if (observaciones.length > LARGO_MAXIMO_OBSERVACIONES) {
    return "Las observaciones no pueden superar los 2000 caracteres";
  }

  if (input.motivo.trim().length > LARGO_MAXIMO_MOTIVO_CONSULTA) {
    return "El motivo de consulta no puede superar los 200 caracteres";
  }

  // HU-24A / HU-38: la orden médica es opcional (sesiones + detalle).
  return validarOrden(input);
}

// Edad cumplida a una fecha ("YYYY-MM-DD"). null si no hay fecha de nacimiento.
export function calcularEdad(fechaNacimiento: string | null, hoy: string): number | null {
  if (!fechaNacimiento) return null;
  const nac = fechaNacimiento.slice(0, 10);
  if (!esFechaValida(nac) || !esFechaValida(hoy)) return null;

  const [anioN, mesN, diaN] = nac.split("-").map(Number);
  const [anioH, mesH, diaH] = hoy.split("-").map(Number);
  let edad = anioH - anioN;
  if (mesH < mesN || (mesH === mesN && diaH < diaN)) edad--;
  return edad >= 0 ? edad : null;
}
