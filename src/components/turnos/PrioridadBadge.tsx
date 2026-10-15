import { etiquetaPrioridad, leerPrioridad, muestraMarcaPrioridad } from "@/lib/turnos/prioridad";

// HU-20. Marca de Alta / Urgente: texto + color (el color no es el único indicador).
// Normal no muestra nada, salvo que se pida explícitamente (detalle del turno).
export function PrioridadBadge({
  prioridad,
  mostrarNormal = false,
}: {
  prioridad: string | null | undefined;
  mostrarNormal?: boolean;
}) {
  if (!muestraMarcaPrioridad(prioridad) && !mostrarNormal) return null;
  const valor = leerPrioridad(prioridad);

  return (
    <span className={`badge-prioridad badge-prioridad-${valor}`}>
      {valor === "urgente" ? "⚠ " : valor === "alta" ? "▲ " : ""}
      Prioridad {etiquetaPrioridad(valor)}
    </span>
  );
}
