// HU-09. Buscar y filtrar turnos: leer los filtros de la URL, validarlos y armar links.
// Lógica pura (sin Supabase ni Next) para poder testearla con `npm test`.
// El filtrado y la paginación los hace fn_buscar_turnos.

import type { EstadoTurno } from "./tipos";
import { esEstadoCobro, type EstadoCobro } from "@/lib/pagos/cobro";

const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;

export const TURNOS_POR_PAGINA = 10;
export const LARGO_MAXIMO_BUSQUEDA = 100;

// Opciones del filtro de estado. "Todos" es una opción del filtro, no un estado.
export const ESTADOS_FILTRO: { valor: EstadoTurno; etiqueta: string }[] = [
  { valor: "confirmado", etiqueta: "Confirmado" },
  { valor: "cancelado", etiqueta: "Cancelado" },
  { valor: "atendido", etiqueta: "Atendido" },
  { valor: "ausente", etiqueta: "Ausente" },
];

export const MENSAJE_RANGO_INVALIDO = "La fecha Hasta no puede ser anterior a Desde";
export const MENSAJE_SIN_RESULTADOS = "No se encontraron turnos con los filtros seleccionados";

export type FiltrosTurnos = {
  texto: string;
  profesional: string | null; // null = Todos
  servicio: string | null; // null = Todos
  desde: string | null; // null = sin límite
  hasta: string | null;
  estado: EstadoTurno | null; // null = Todos
  cobro: EstadoCobro | null; // HU-17: estado de cobro; null = Todos
  pagina: number;
};

// Lo que llega en searchParams de /turnos.
export type ParamsTurnos = {
  q?: string;
  profesional?: string;
  servicio?: string;
  desde?: string;
  hasta?: string;
  estado?: string;
  cobro?: string; // HU-17
  pagina?: string;
};

// true si es una fecha real "YYYY-MM-DD" (rechaza "2026-02-30").
function esFecha(valor: string): boolean {
  if (!FECHA_OK.test(valor)) return false;
  const dia = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === valor;
}

// Al entrar sin filtros (sin desde ni hasta en la URL) se ven los turnos de hoy.
// "Limpiar filtros" manda desde y hasta vacíos: así se distingue de la primera entrada
// y se listan todos los turnos. Un id o estado desconocido cuenta como "Todos".
export function leerFiltrosTurnos(params: ParamsTurnos, hoy: string): FiltrosTurnos {
  const primeraEntrada = params.desde === undefined && params.hasta === undefined;
  const pagina = Number.parseInt(params.pagina ?? "", 10);
  const estado = ESTADOS_FILTRO.find((e) => e.valor === params.estado)?.valor ?? null;

  return {
    texto: (params.q ?? "").trim().slice(0, LARGO_MAXIMO_BUSQUEDA),
    profesional: params.profesional && UUID_OK.test(params.profesional) ? params.profesional : null,
    servicio: params.servicio && UUID_OK.test(params.servicio) ? params.servicio : null,
    desde: primeraEntrada ? hoy : params.desde?.trim() || null,
    hasta: primeraEntrada ? hoy : params.hasta?.trim() || null,
    estado,
    cobro: esEstadoCobro(params.cobro) ? params.cobro : null,
    pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : 1,
  };
}

// Mismas reglas que la base: fechas reales y Hasta no anterior a Desde.
export function validarFiltrosTurnos(filtros: FiltrosTurnos): string | null {
  if (filtros.desde && !esFecha(filtros.desde)) return "La fecha Desde no es válida";
  if (filtros.hasta && !esFecha(filtros.hasta)) return "La fecha Hasta no es válida";
  if (filtros.desde && filtros.hasta && filtros.hasta < filtros.desde) {
    return MENSAJE_RANGO_INVALIDO;
  }
  return null;
}

// Link a /turnos con los filtros (para paginar sin perderlos).
// desde y hasta van siempre, aunque estén vacíos: vacío = sin límite (ver leerFiltrosTurnos).
export function urlTurnos(filtros: FiltrosTurnos, pagina = 1): string {
  const params = new URLSearchParams();
  if (filtros.texto) params.set("q", filtros.texto);
  if (filtros.profesional) params.set("profesional", filtros.profesional);
  if (filtros.servicio) params.set("servicio", filtros.servicio);
  params.set("desde", filtros.desde ?? "");
  params.set("hasta", filtros.hasta ?? "");
  if (filtros.estado) params.set("estado", filtros.estado);
  if (filtros.cobro) params.set("cobro", filtros.cobro);
  if (pagina > 1) params.set("pagina", String(pagina));
  return `/turnos?${params.toString()}`;
}

// "Limpiar filtros": sin ningún filtro, tampoco de fechas.
export const URL_TURNOS_SIN_FILTROS = "/turnos?desde=&hasta=";

// HU-17. Atajo "Ver pendientes de cobro" (desde /pagos): todos los pendientes, sin límite
// de fechas. En orden cronológico, arriba quedan los más viejos sin cobrar.
export const URL_PENDIENTES_COBRO = "/turnos?desde=&hasta=&cobro=pendiente";

// HU-17. Atajos de período del listado (se muestran con el filtro Pendiente):
// "Todos", "Hasta hoy" (ya ocurrieron y no se cobraron) y "Próximos" (de hoy en adelante).
// Solo completan Desde / Hasta; conservan el resto de los filtros y vuelven a la página 1.
export type AtajoPeriodo = "todos" | "hasta_hoy" | "proximos";

export const ATAJOS_PERIODO: { valor: AtajoPeriodo; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "hasta_hoy", etiqueta: "Hasta hoy" },
  { valor: "proximos", etiqueta: "Próximos" },
];

function rangoDelAtajo(atajo: AtajoPeriodo, hoy: string): { desde: string | null; hasta: string | null } {
  if (atajo === "hasta_hoy") return { desde: null, hasta: hoy };
  if (atajo === "proximos") return { desde: hoy, hasta: null };
  return { desde: null, hasta: null };
}

export function urlAtajoPeriodo(filtros: FiltrosTurnos, atajo: AtajoPeriodo, hoy: string): string {
  return urlTurnos({ ...filtros, ...rangoDelAtajo(atajo, hoy) });
}

// Qué atajo coincide con el rango actual (para marcarlo como elegido). null = rango a mano.
export function atajoActual(filtros: FiltrosTurnos, hoy: string): AtajoPeriodo | null {
  return (
    ATAJOS_PERIODO.find((a) => {
      const rango = rangoDelAtajo(a.valor, hoy);
      return rango.desde === filtros.desde && rango.hasta === filtros.hasta;
    })?.valor ?? null
  );
}

export function totalPaginas(total: number): number {
  return Math.max(1, Math.ceil(total / TURNOS_POR_PAGINA));
}
