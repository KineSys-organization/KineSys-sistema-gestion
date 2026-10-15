// HU-24B. Filtros del historial de órdenes médicas (lógica pura, para `npm test`).
// La base (fn_listar_ordenes_paciente) vuelve a validar el rango y los permisos.

const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MENSAJE_RANGO_ORDENES = "La fecha Hasta no puede ser anterior a Desde";

export type FiltrosOrdenes = {
  desde: string; // "" = sin límite
  hasta: string;
  profesional: string; // "" = Todos
};

type Params = Record<string, string | string[] | undefined>;

function texto(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor ?? "").trim();
}

function esFecha(valor: string): boolean {
  if (!FECHA_OK.test(valor)) return false;
  const dia = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === valor;
}

export function esUuid(valor: string): boolean {
  return UUID_OK.test(valor.trim());
}

// Lee los filtros de la URL. Lo que no es válido se ignora (queda "sin filtro").
export function leerFiltrosOrdenes(params: Params): FiltrosOrdenes {
  const desde = texto(params.desde);
  const hasta = texto(params.hasta);
  const profesional = texto(params.profesional);
  return {
    desde: esFecha(desde) ? desde : "",
    hasta: esFecha(hasta) ? hasta : "",
    profesional: esUuid(profesional) ? profesional : "",
  };
}

export function validarFiltrosOrdenes(filtros: FiltrosOrdenes): string | null {
  if (filtros.desde && filtros.hasta && filtros.hasta < filtros.desde) {
    return MENSAJE_RANGO_ORDENES;
  }
  return null;
}

export function hayFiltrosOrdenes(filtros: FiltrosOrdenes): boolean {
  return Boolean(filtros.desde || filtros.hasta || filtros.profesional);
}

// "/pacientes/abc" + filtros -> "/pacientes/abc?desde=...#ordenes". Sin filtros = la base.
export function urlOrdenes(base: string, filtros: FiltrosOrdenes, ancla = ""): string {
  const params = new URLSearchParams();
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  if (filtros.profesional) params.set("profesional", filtros.profesional);
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}${ancla}`;
}

// Mensaje de lista vacía: no es un error.
export function mensajeSinOrdenes(totalSinFiltros: number): string {
  return totalSinFiltros === 0
    ? "Este paciente no tiene órdenes médicas registradas"
    : "No hay órdenes para esos filtros";
}
