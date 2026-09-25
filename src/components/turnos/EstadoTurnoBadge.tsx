import type { EstadoTurno } from "@/lib/turnos/tipos";
import { etiquetaMotivo } from "@/lib/turnos/validar";

const ETIQUETA: Record<EstadoTurno, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  ausente: "Ausente",
  atendido: "Atendido",
};

const CLASE: Record<EstadoTurno, string> = {
  confirmado: "badge-activo",
  cancelado: "badge-cancelado",
  ausente: "badge-inactivo",
  atendido: "badge-atendido",
};

// Estado del turno en las agendas (Recepción y Mi agenda). En un cancelado se ve
// también el motivo como texto: el estado no depende solo del color.
export function EstadoTurnoBadge({
  estado,
  motivoCancelacion,
}: {
  estado: EstadoTurno;
  motivoCancelacion?: string | null;
}) {
  return (
    <>
      <span className={CLASE[estado] ?? "badge-inactivo"}>{ETIQUETA[estado] ?? estado}</span>
      {estado === "cancelado" && motivoCancelacion && (
        <span className="motivo-cancelacion">{etiquetaMotivo(motivoCancelacion)}</span>
      )}
    </>
  );
}
