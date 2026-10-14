// HU-17. Estado de cobro de un turno. Lo calcula la base (fn_estado_cobro, migración 024);
// acá solo están las etiquetas y la clase de color para mostrarlo. Nunca se calcula en el front.
// Lógica pura (sin Supabase ni Next) para poder testearla con `npm test`.

export const ESTADOS_COBRO = [
  { valor: "pendiente", etiqueta: "Pendiente de pago", clase: "badge-cobro-pendiente" },
  { valor: "pagado", etiqueta: "Pagado", clase: "badge-activo" },
  { valor: "reembolsado", etiqueta: "Reembolsado", clase: "badge-ausente" },
  { valor: "no_corresponde", etiqueta: "No corresponde cobro", clase: "badge-inactivo" },
] as const;

export type EstadoCobro = (typeof ESTADOS_COBRO)[number]["valor"];

export function esEstadoCobro(valor: string | null | undefined): valor is EstadoCobro {
  return ESTADOS_COBRO.some((e) => e.valor === valor);
}

// Texto del estado (siempre se muestra el texto, no solo el color).
export function etiquetaCobro(estado: string | null | undefined): string {
  return ESTADOS_COBRO.find((e) => e.valor === estado)?.etiqueta ?? "—";
}

export function claseCobro(estado: string | null | undefined): string {
  return ESTADOS_COBRO.find((e) => e.valor === estado)?.clase ?? "badge-inactivo";
}
