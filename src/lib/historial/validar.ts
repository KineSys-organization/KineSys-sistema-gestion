// HU-16. Filtros del historial del paciente (fechas + profesional + página).
// En /pacientes/[id] conviven con los de HU-24B (órdenes), así que van con prefijo h_.
// Lógica pura para `npm test`.

import type { FiltrosHistorial } from "@/lib/historial/tipos";

const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;

export const MENSAJE_RANGO_INVALIDO =
  "La fecha desde no puede ser posterior a la fecha hasta";
export const MENSAJE_SIN_TURNOS = "Este paciente todavía no tiene turnos";
export const MENSAJE_SIN_RESULTADOS = "No hay turnos para esos filtros";
export const POR_PAGINA = 10;

export type ParamsHistorial = {
  hdesde?: string | string[];
  hhasta?: string | string[];
  hprofesional?: string | string[];
  hpagina?: string | string[];
  // En /historia-clinica no chocan con nada: también acepta sin prefijo.
  desde?: string | string[];
  hasta?: string | string[];
  profesional?: string | string[];
  pagina?: string | string[];
};

function uno(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

function fechaONull(valor: string): string | null {
  return FECHA_OK.test(valor) ? valor : null;
}

// prefijados=true en /pacientes/[id] (convive con órdenes). false en historia clínica.
export function leerFiltrosHistorial(
  params: ParamsHistorial,
  prefijados = false
): FiltrosHistorial {
  const profesional = uno(prefijados ? params.hprofesional : params.profesional ?? params.hprofesional);
  const pagina = Number(uno(prefijados ? params.hpagina : params.pagina ?? params.hpagina));
  const desde = uno(prefijados ? params.hdesde : params.desde ?? params.hdesde);
  const hasta = uno(prefijados ? params.hhasta : params.hasta ?? params.hhasta);
  return {
    desde: fechaONull(desde),
    hasta: fechaONull(hasta),
    profesional: UUID_OK.test(profesional) ? profesional : null,
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

export function validarFiltrosHistorial(filtros: FiltrosHistorial): string | null {
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    return MENSAJE_RANGO_INVALIDO;
  }
  return null;
}

export function totalPaginas(total: number, porPagina = POR_PAGINA): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / porPagina));
}

export function urlHistorial(
  base: string,
  filtros: FiltrosHistorial,
  opts?: { pagina?: number; prefijados?: boolean; ancla?: string }
): string {
  const prefijados = opts?.prefijados ?? false;
  const pagina = opts?.pagina ?? filtros.pagina;
  const params = new URLSearchParams();
  const kDesde = prefijados ? "hdesde" : "desde";
  const kHasta = prefijados ? "hhasta" : "hasta";
  const kProf = prefijados ? "hprofesional" : "profesional";
  const kPag = prefijados ? "hpagina" : "pagina";
  if (filtros.desde) params.set(kDesde, filtros.desde);
  if (filtros.hasta) params.set(kHasta, filtros.hasta);
  if (filtros.profesional) params.set(kProf, filtros.profesional);
  if (pagina > 1) params.set(kPag, String(pagina));
  const qs = params.toString();
  const [path, hashExistente] = base.split("#");
  const ancla = opts?.ancla ?? (hashExistente ? `#${hashExistente}` : "");
  return `${path}${qs ? `?${qs}` : ""}${ancla}`;
}

export function esIdValido(id: string | null | undefined): boolean {
  return UUID_OK.test((id ?? "").trim());
}
