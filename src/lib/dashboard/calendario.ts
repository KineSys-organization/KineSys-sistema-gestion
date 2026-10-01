// HU-15. Calendario mensual del profesional y color por proximidad.
// Lógica pura (sin Supabase ni Next) para poder testearla con `npm test`.
import type { EstadoTurno } from "@/lib/turnos/tipos";
import type { TurnoMes } from "@/lib/dashboard/tipos";

const MES_OK = /^\d{4}-(0[1-9]|1[0-2])$/;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "2026-09-29" -> "2026-09"
export function mesDeFecha(fecha: string): string {
  return fecha.slice(0, 7);
}

// Mes de la URL (?mes=2026-09). Acepta solo "YYYY-MM" con un mes real.
export function esMesValido(mes: string): boolean {
  return MES_OK.test(mes);
}

// "2026-09" + 1 -> "2026-10"; "2026-01" - 1 -> "2025-12".
export function sumarMeses(mes: string, cantidad: number): string {
  const [anio, numero] = mes.split("-").map(Number);
  const total = anio * 12 + (numero - 1) + cantidad;
  const nuevoAnio = Math.floor(total / 12);
  const nuevoMes = (total % 12) + 1;
  return `${nuevoAnio}-${String(nuevoMes).padStart(2, "0")}`;
}

// "2026-09" -> "septiembre de 2026"
export function nombreMes(mes: string): string {
  const [anio, numero] = mes.split("-").map(Number);
  return `${MESES[numero - 1]} de ${anio}`;
}

// Días entre dos fechas "YYYY-MM-DD" (hasta - desde).
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// Color por proximidad (reglas de negocio de HU-15). Solo los confirmados de hoy o futuros
// tienen color; atendidos, cancelados, ausentes o confirmados ya pasados van en gris.
export type Proximidad = "hoy" | "pronto" | "semana" | "lejos" | "gris";

export function proximidad(
  turno: { fecha: string; estado: EstadoTurno },
  hoy: string
): Proximidad {
  if (turno.estado !== "confirmado") return "gris";
  const dias = diasEntre(hoy, turno.fecha);
  if (dias < 0) return "gris";
  if (dias === 0) return "hoy";
  if (dias <= 3) return "pronto";
  if (dias <= 7) return "semana";
  return "lejos";
}

// Referencias del calendario (el color nunca va solo: cada turno muestra hora y estado).
export const REFERENCIAS_PROXIMIDAD: { proximidad: Proximidad; texto: string }[] = [
  { proximidad: "hoy", texto: "Hoy" },
  { proximidad: "pronto", texto: "De 1 a 3 días" },
  { proximidad: "semana", texto: "De 4 a 7 días" },
  { proximidad: "lejos", texto: "Más de 7 días" },
  { proximidad: "gris", texto: "Atendido, cancelado, ausente o pasado" },
];

// "Hoy", "Mañana", "En 5 días", "Hace 2 días": se muestra junto al color en la lista del día.
export function textoProximidad(fecha: string, hoy: string): string {
  const dias = diasEntre(hoy, fecha);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias === -1) return "Ayer";
  return dias > 0 ? `En ${dias} días` : `Hace ${-dias} días`;
}

// Una celda del calendario: un día del mes con sus turnos. null = relleno antes/después del mes.
export type CeldaMes = { fecha: string; dia: number; turnos: TurnoMes[] } | null;

// Semanas de lunes a domingo que cubren el mes. Sábado y domingo son días normales:
// si hay turnos aparecen y si no, quedan vacíos.
export function armarMes(mes: string, turnos: TurnoMes[]): CeldaMes[][] {
  const primero = new Date(`${mes}-01T00:00:00Z`);
  const diasDelMes = new Date(
    Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() + 1, 0)
  ).getUTCDate();

  const celdas: CeldaMes[] = [];
  // getUTCDay: 0 = domingo. Lo paso a lunes = 0.
  const hueco = (primero.getUTCDay() + 6) % 7;
  for (let i = 0; i < hueco; i++) celdas.push(null);

  for (let dia = 1; dia <= diasDelMes; dia++) {
    const fecha = `${mes}-${String(dia).padStart(2, "0")}`;
    celdas.push({ fecha, dia, turnos: turnos.filter((t) => t.fecha.slice(0, 10) === fecha) });
  }

  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas: CeldaMes[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

// Día que se muestra elegido: el pedido si es del mes; si no, hoy (si es del mes);
// si no, el primer día con turnos. null = mes sin turnos y sin día pedido.
export function diaElegido(
  mes: string,
  pedido: string,
  hoy: string,
  turnos: TurnoMes[]
): string | null {
  if (pedido && mesDeFecha(pedido) === mes) return pedido;
  if (mesDeFecha(hoy) === mes) return hoy;
  return turnos[0]?.fecha.slice(0, 10) ?? null;
}

// URL del Inicio con el mes y el día del calendario.
export function urlDashboard(mes: string, dia?: string | null): string {
  return dia ? `/?mes=${mes}&dia=${dia}` : `/?mes=${mes}`;
}
