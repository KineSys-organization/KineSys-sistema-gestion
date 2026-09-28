// HU-26. Validaciones y helpers del período (sin Supabase ni Next, para `npm test`).
// Los cálculos los hace la base (fn_consultar_indicadores_generales).

import { esFechaValida, sumarDias } from "@/lib/atencion/validar";

// Mismo límite que la función de la base.
export const DIAS_MAXIMOS_PERIODO = 366;

export type Periodo = { desde: string; hasta: string };

// Días entre dos fechas "YYYY-MM-DD" (hasta - desde).
export function diasEntre(desde: string, hasta: string): number {
  const inicio = Date.parse(`${desde}T00:00:00Z`);
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((fin - inicio) / 86_400_000);
}

export function validarPeriodo(periodo: Periodo): string | null {
  const desde = periodo.desde.trim();
  const hasta = periodo.hasta.trim();

  if (!desde || !hasta) return "Elegí el período (desde y hasta)";
  if (!esFechaValida(desde)) return "La fecha desde no es válida";
  if (!esFechaValida(hasta)) return "La fecha hasta no es válida";
  if (desde > hasta) return "La fecha desde no puede ser posterior a la fecha hasta";
  if (diasEntre(desde, hasta) > DIAS_MAXIMOS_PERIODO) return "El período no puede superar un año";

  return null;
}

// Primer y último día del mes de una fecha.
function mesDe(fecha: string): Periodo {
  const [anio, mes] = fecha.split("-").map(Number);
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const siguiente = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
  return { desde, hasta: sumarDias(siguiente, -1) };
}

// Atajos del filtro. Por defecto se abre "Este mes".
export function periodosRapidos(hoy: string): { texto: string; periodo: Periodo }[] {
  const esteMes = mesDe(hoy);
  return [
    { texto: "Últimos 7 días", periodo: { desde: sumarDias(hoy, -6), hasta: hoy } },
    { texto: "Este mes", periodo: esteMes },
    { texto: "Mes anterior", periodo: mesDe(sumarDias(esteMes.desde, -1)) },
  ];
}

export function periodoPorDefecto(hoy: string): Periodo {
  return mesDe(hoy);
}

// "2026-09-01" -> "01/09/2026".
export function formatearFechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}
