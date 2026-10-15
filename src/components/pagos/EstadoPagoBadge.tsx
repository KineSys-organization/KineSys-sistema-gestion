import type { EstadoPagoTurno } from "@/lib/pagos/tipos";

// HU-17. Estado del pago: Pagado o Reembolsado (lo deriva la base).
export function EstadoPagoBadge({ estado }: { estado: EstadoPagoTurno }) {
  return (
    <span className={estado === "Reembolsado" ? "badge-ausente" : "badge-activo"}>{estado}</span>
  );
}
