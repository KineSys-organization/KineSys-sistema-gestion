import { PASOS_TURNO, type NumeroPaso } from "@/lib/turnos/flujo";

// Indicador de pasos de "Otorgar turno" (HU-28): 1 paciente → 2 servicio y profesional →
// 3 fecha y horario → 4 cobertura → 5 confirmar.
// Muestra dónde está Recepción y qué falta. Es solo visual (una lista ordenada).
export function PasosTurno({ actual }: { actual: NumeroPaso }) {
  return (
    <ol className="pasos-turno" aria-label="Pasos para otorgar un turno">
      {PASOS_TURNO.map((paso, i) => {
        const numero = i + 1;
        const estado = numero < actual ? "hecho" : numero === actual ? "actual" : "pendiente";
        return (
          <li
            key={paso}
            className={`paso paso-${estado}`}
            aria-current={estado === "actual" ? "step" : undefined}
          >
            <span className="paso-numero" aria-hidden="true">
              {estado === "hecho" ? "✓" : numero}
            </span>
            <span>{paso}</span>
          </li>
        );
      })}
    </ol>
  );
}
