// Indicador de pasos de "Otorgar turno": 1 horario → 2 paciente → 3 confirmar.
// Muestra dónde está Recepción y qué falta. Es solo visual (una lista ordenada).
const PASOS = ["Horario", "Paciente", "Confirmar"];

export function PasosTurno({ actual }: { actual: 1 | 2 | 3 }) {
  return (
    <ol className="pasos-turno" aria-label="Pasos para otorgar un turno">
      {PASOS.map((paso, i) => {
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
