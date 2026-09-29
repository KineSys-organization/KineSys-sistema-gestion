import Link from "next/link";
import {
  armarSemanas,
  DIAS_SEMANA,
  type DiaCalendario,
} from "@/lib/disponibilidad/calendario";
import { formatearFecha } from "@/lib/turnos/validar";

// Calendario de 30 días con los horarios libres de cada día (mismas clases que el de
// /disponibilidad). Server Component: recibe cómo armar el link de cada día.
// Lo usa HU-10C (reprogramar); /disponibilidad mantiene el suyo.
export function CalendarioDias({
  dias,
  fechaElegida,
  hrefDia,
}: {
  dias: DiaCalendario[];
  fechaElegida: string | null;
  hrefDia: (fecha: string) => string;
}) {
  const semanas = armarSemanas(dias);

  return (
    <table className="calendario">
      <thead>
        <tr>
          {DIAS_SEMANA.map((dia) => (
            <th key={dia} scope="col">
              {dia}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {semanas.map((semana, i) => (
          <tr key={i}>
            {semana.map((celda, j) => (
              <td key={j}>
                {celda &&
                  (celda.libres > 0 ? (
                    <Link
                      className={`dia-calendario dia-libre${celda.fecha === fechaElegida ? " dia-elegido" : ""}`}
                      href={hrefDia(celda.fecha)}
                      aria-current={celda.fecha === fechaElegida ? "date" : undefined}
                      aria-label={`${formatearFecha(celda.fecha)}: ${celda.libres} horarios libres`}
                      scroll={false}
                    >
                      <span className="dia-numero">
                        {celda.dia}
                        {celda.esPrimeroDelMes && <small> {celda.mes}</small>}
                      </span>
                      <span className="dia-libres">
                        {celda.libres}
                        <span className="dia-libres-texto">
                          {celda.libres === 1 ? " libre" : " libres"}
                        </span>
                      </span>
                    </Link>
                  ) : (
                    <span
                      className="dia-calendario dia-sin-lugar"
                      aria-label={`${formatearFecha(celda.fecha)}: sin horarios`}
                    >
                      <span className="dia-numero">
                        {celda.dia}
                        {celda.esPrimeroDelMes && <small> {celda.mes}</small>}
                      </span>
                      <span className="dia-libres">—</span>
                    </span>
                  ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
