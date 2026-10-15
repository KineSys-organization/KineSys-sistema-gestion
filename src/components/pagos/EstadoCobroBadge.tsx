import { claseCobro, esEstadoCobro, etiquetaCobro } from "@/lib/pagos/cobro";

// HU-17. Estado de cobro del turno con texto y color (nunca solo color).
// Si la base no lo manda (al Profesional le llega null), no se muestra nada.
export function EstadoCobroBadge({ estado }: { estado: string | null | undefined }) {
  if (!esEstadoCobro(estado)) return null;
  return <span className={claseCobro(estado)}>{etiquetaCobro(estado)}</span>;
}
