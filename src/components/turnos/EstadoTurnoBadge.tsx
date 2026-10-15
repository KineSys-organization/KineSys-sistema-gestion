import type { EstadoTurno } from "@/lib/turnos/tipos";
import { etiquetaMotivo } from "@/lib/turnos/validar";
import { colorPorEstado } from "@/lib/dashboard/calendario";

const ETIQUETA: Record<EstadoTurno, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  ausente: "Ausente",
  atendido: "Atendido",
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
      <span className={`badge-turno badge-turno-${colorPorEstado(estado)}`}>
        {ETIQUETA[estado] ?? estado}
      </span>
      {estado === "cancelado" && motivoCancelacion && (
        <span className="motivo-cancelacion">
          Motivo: {etiquetaMotivo(motivoCancelacion)}
        </span>
      )}
    </>
  );
}
