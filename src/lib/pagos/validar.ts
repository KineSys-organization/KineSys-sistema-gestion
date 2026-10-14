// HU-14. Pagos: medios, importes, validaciones y filtros del listado.
// HU-22 / HU-17: reembolso total y estado Pagado / Reembolsado.
// Lógica pura (sin Supabase ni Next) para poder testearla con `npm test`.
// La base (fn_registrar_pago / fn_corregir_pago / fn_registrar_reembolso) vuelve a validar todo.
import { puedeHacer } from "@/lib/auth/permisos";
import type { Pago } from "@/lib/pagos/tipos";

const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;

// Pesos con hasta dos decimales. Acepta coma o punto decimal ("15000,50" o "15000.50"),
// sin separador de miles: "1.500" se rechaza para no confundirlo con 1,50.
const IMPORTE_OK = /^\d{1,8}([.,]\d{1,2})?$/;

export const PAGOS_POR_PAGINA = 10;
export const LARGO_MAXIMO_MOTIVO = 200;
export const LARGO_MAXIMO_BUSQUEDA = 100;

// Lista cerrada (misma que el check pago_medio_valido). Sin texto libre ni "Obra social".
export const MEDIOS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "debito", etiqueta: "Tarjeta de débito" },
  { valor: "credito", etiqueta: "Tarjeta de crédito" },
] as const;

export type MedioPago = (typeof MEDIOS_PAGO)[number]["valor"];

export const MENSAJE_YA_PAGADO = "Este turno ya tiene un pago registrado";
export const MENSAJE_RANGO_INVALIDO = "La fecha Hasta no puede ser anterior a Desde";
export const MENSAJE_SIN_PAGOS = "No hay pagos para esos filtros";

export function etiquetaMedio(medio: string | null | undefined): string {
  return MEDIOS_PAGO.find((m) => m.valor === medio)?.etiqueta ?? "—";
}

export function esMedioPago(valor: string): valor is MedioPago {
  return MEDIOS_PAGO.some((m) => m.valor === valor);
}

// "15000,5" -> 1500050 centavos. null si no es un importe válido.
// Se trabaja en centavos (enteros) para que la resta no tenga errores de redondeo.
export function aCentavos(texto: string): number | null {
  const valor = texto.trim();
  if (!IMPORTE_OK.test(valor)) return null;
  const [enteros, decimales = ""] = valor.replace(",", ".").split(".");
  return Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
}

// 1500050 -> "15000.50" (lo que se manda a la base como numeric).
export function centavosATexto(centavos: number): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// 15000.5 -> "$ 15.000,50" (pesos argentinos).
export function formatearPesos(importe: number | string | null | undefined): string {
  const numero = Number(importe);
  if (importe === null || importe === undefined || Number.isNaN(numero)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(numero);
}

// "2026-10-01T18:05:00+00:00" -> "01/10/2026, 15:05" (fecha y hora de registro, en Argentina).
export function formatearMomento(valor: string | null | undefined): string {
  if (!valor) return "—";
  const momento = new Date(valor);
  if (Number.isNaN(momento.getTime())) return valor;
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(momento);
}

// Precio del servicio (numeric de la base) -> texto para precargar el campo: 15000 -> "15000".
export function precioSugerido(precio: number | string | null | undefined): string {
  if (precio === null || precio === undefined || precio === "") return "";
  const centavos = Math.round(Number(precio) * 100);
  if (!Number.isFinite(centavos) || centavos <= 0) return "";
  return centavos % 100 === 0 ? String(centavos / 100) : centavosATexto(centavos).replace(".", ",");
}

export type CamposPago = {
  importeBase: string;
  descuento: string; // vacío = 0
  medio: string;
  conObraSocial: boolean; // el descuento solo se aplica si el turno tiene obra social
};

export type ImportesPago = {
  base: number; // centavos
  descuento: number;
  final: number;
};

// Valida y calcula los importes. Devuelve el error o los importes en centavos.
export function calcularPago(campos: CamposPago): { error: string } | { importes: ImportesPago } {
  if (!campos.importeBase.trim()) return { error: "Ingresá el importe base" };

  const base = aCentavos(campos.importeBase);
  if (base === null) {
    return { error: "El importe base no es válido: usá números, sin puntos de miles (ej.: 15000 o 15000,50)" };
  }
  if (base <= 0) return { error: "El importe base debe ser mayor que cero" };

  const textoDescuento = campos.descuento.trim();
  if (textoDescuento.startsWith("-")) return { error: "El descuento no puede ser negativo" };
  const descuento = textoDescuento ? aCentavos(textoDescuento) : 0;
  if (descuento === null) {
    return { error: "El descuento no es válido: usá números, sin puntos de miles (ej.: 2500 o 2500,50)" };
  }
  if (descuento > 0 && !campos.conObraSocial) {
    return { error: "Solo se aplica descuento si el turno tiene cobertura de obra social" };
  }

  const final = base - descuento;
  if (final <= 0) return { error: "El descuento no puede dejar el importe final en cero o menos" };

  if (!esMedioPago(campos.medio)) return { error: "Elegí un medio de pago válido" };

  return { importes: { base, descuento, final } };
}

// Corregir: mismas reglas que el alta, más el motivo obligatorio.
export function validarCorreccion(campos: CamposPago & { motivo: string }): string | null {
  const resultado = calcularPago(campos);
  if ("error" in resultado) return resultado.error;
  const motivo = campos.motivo.trim();
  if (!motivo) return "Indicá el motivo de la corrección";
  if (motivo.length > LARGO_MAXIMO_MOTIVO) {
    return `El motivo no puede superar los ${LARGO_MAXIMO_MOTIVO} caracteres`;
  }
  return null;
}

export function esIdTurnoPago(id: string): boolean {
  return UUID_OK.test(id.trim());
}

// ============ Reembolso (HU-22) ============

export const LARGO_MAXIMO_DETALLE_REEMBOLSO = 200;

// Misma lista que valida fn_registrar_reembolso.
export const MOTIVOS_REEMBOLSO = [
  { valor: "turno_cancelado", etiqueta: "Turno cancelado" },
  { valor: "pedido_paciente", etiqueta: "Pedido del paciente" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export type MotivoReembolso = (typeof MOTIVOS_REEMBOLSO)[number]["valor"];

export const MENSAJE_YA_REEMBOLSADO = "Este pago ya fue reembolsado";
export const AVISO_REEMBOLSO =
  "El reembolso registra dinero devuelto. Si el pago fue por billetera virtual, la devolución en la billetera se hace fuera del sistema.";

export function etiquetaMotivoReembolso(motivo: string | null | undefined): string {
  return MOTIVOS_REEMBOLSO.find((m) => m.valor === motivo)?.etiqueta ?? "—";
}

export function esMotivoReembolso(valor: string): valor is MotivoReembolso {
  return MOTIVOS_REEMBOLSO.some((m) => m.valor === valor);
}

export type CamposReembolso = {
  motivo: string;
  detalle: string;
  medio: string;
};

// Mismos mensajes que la base. El detalle es opcional salvo con motivo Otro.
export function validarReembolso(campos: CamposReembolso): string | null {
  if (!esMotivoReembolso(campos.motivo)) return "Elegí el motivo del reembolso";
  const detalle = campos.detalle.trim();
  if (detalle.length > LARGO_MAXIMO_DETALLE_REEMBOLSO) {
    return `El detalle no puede superar los ${LARGO_MAXIMO_DETALLE_REEMBOLSO} caracteres`;
  }
  if (campos.motivo === "otro" && !detalle) {
    return "Indicá el detalle del reembolso cuando el motivo es Otro";
  }
  if (!esMedioPago(campos.medio)) return "Elegí un medio de devolución válido";
  return null;
}

// Botón "Registrar reembolso": la base dice si el pago es reembolsable y la matriz si el rol puede.
export function mostrarBotonReembolso(reembolsable: boolean, rol: string | null | undefined): boolean {
  return reembolsable && puedeHacer(rol, "pagos.reembolsar");
}

// Un pago reembolsado no se corrige (fn_corregir_pago igual lo rechaza).
export function puedeCorregirPago(pago: Pick<Pago, "estado"> | null): boolean {
  return pago !== null && pago.estado !== "Reembolsado";
}

// ============ Comprobante (HU-35) ============

// Ancho del número impreso: 123 -> "0000123" (si crece, se muestra entero).
export const DIGITOS_COMPROBANTE = 7;
const NUMERO_COMPROBANTE_OK = /^\d{1,12}$/;

export function formatearNumeroComprobante(numero: number | string | null | undefined): string {
  if (numero === null || numero === undefined || numero === "") return "—";
  return String(numero).padStart(DIGITOS_COMPROBANTE, "0");
}

// Lo que se escribe en la búsqueda ("0000123", "123", " 123 ") -> 123. Inválido o 0 -> null.
export function leerNumeroComprobante(texto: string | null | undefined): number | null {
  const valor = (texto ?? "").trim();
  if (!NUMERO_COMPROBANTE_OK.test(valor)) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

// Título de la ventana al imprimir = nombre sugerido del PDF.
// "Comprobante 0000123 - Pérez, Juan"
export function tituloComprobante(numero: number | string, apellido: string, nombre: string): string {
  return `Comprobante ${formatearNumeroComprobante(numero)} - ${apellido}, ${nombre}`;
}

export function urlComprobante(idPago: string, imprimir = false): string {
  return `/pagos/${idPago}/comprobante${imprimir ? "?imprimir=1" : ""}`;
}

// ============ Listado (/pagos) ============

// HU-22: null = todos; "con" / "sin" reembolso (parámetro p_reembolso de fn_listar_pagos).
export type FiltroReembolso = "con" | "sin" | null;

export const OPCIONES_FILTRO_REEMBOLSO = [
  { valor: "", etiqueta: "Todos" },
  { valor: "con", etiqueta: "Con reembolso" },
  { valor: "sin", etiqueta: "Sin reembolso" },
] as const;

export type FiltrosPagos = {
  texto: string; // paciente: nombre, apellido o DNI
  desde: string | null; // fecha del PAGO; null = sin límite
  hasta: string | null;
  reembolso: FiltroReembolso;
  numero: number | null; // HU-35: número de comprobante; null = todos
  pagina: number;
};

export type ParamsPagos = {
  q?: string;
  desde?: string;
  hasta?: string;
  reembolso?: string;
  numero?: string; // HU-35
  pagina?: string;
};

function leerFiltroReembolso(valor: string | undefined): FiltroReembolso {
  const limpio = valor?.trim();
  return limpio === "con" || limpio === "sin" ? limpio : null;
}

function esFecha(valor: string): boolean {
  if (!FECHA_OK.test(valor)) return false;
  const dia = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === valor;
}

export function leerFiltrosPagos(params: ParamsPagos): FiltrosPagos {
  const pagina = Number.parseInt(params.pagina ?? "", 10);
  return {
    texto: (params.q ?? "").trim().slice(0, LARGO_MAXIMO_BUSQUEDA),
    desde: params.desde?.trim() || null,
    hasta: params.hasta?.trim() || null,
    reembolso: leerFiltroReembolso(params.reembolso),
    // Un número inválido se ignora, como los demás filtros (no rompe la pantalla).
    numero: leerNumeroComprobante(params.numero),
    pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : 1,
  };
}

// Mismas reglas que la base: fechas reales y Hasta no anterior a Desde.
export function validarFiltrosPagos(filtros: FiltrosPagos): string | null {
  if (filtros.desde && !esFecha(filtros.desde)) return "La fecha Desde no es válida";
  if (filtros.hasta && !esFecha(filtros.hasta)) return "La fecha Hasta no es válida";
  if (filtros.desde && filtros.hasta && filtros.hasta < filtros.desde) {
    return MENSAJE_RANGO_INVALIDO;
  }
  return null;
}

// Link a /pagos con los filtros (para paginar sin perderlos).
export function urlPagos(filtros: FiltrosPagos, pagina = 1): string {
  const params = new URLSearchParams();
  if (filtros.texto) params.set("q", filtros.texto);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  if (filtros.reembolso) params.set("reembolso", filtros.reembolso);
  if (filtros.numero) params.set("numero", String(filtros.numero));
  if (pagina > 1) params.set("pagina", String(pagina));
  const query = params.toString();
  return query ? `/pagos?${query}` : "/pagos";
}

export function totalPaginasPagos(total: number): number {
  return Math.max(1, Math.ceil(total / PAGOS_POR_PAGINA));
}
