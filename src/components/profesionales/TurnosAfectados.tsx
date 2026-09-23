import Link from "next/link";
import type { TurnoAfectado } from "@/lib/profesionales/horarios";
import { formatearFecha } from "@/lib/turnos/validar";

export function TurnosAfectados({ turnos, guardado = false }: {
  turnos: TurnoAfectado[];
  guardado?: boolean;
}) {
  return (
    <section className="aviso-accion" aria-live="polite">
      <h4>{guardado ? "Cambio guardado" : "Antes de confirmar"}</h4>
      {turnos.length === 0 ? <p>No hay turnos reservados afectados por este cambio.</p> : (
        <>
          <p>{guardado
            ? "Estos turnos quedaron fuera del nuevo horario. Siguen confirmados, sin modificaciones ni cancelaciones. Informá a Recepción para que los gestione."
            : "Estos turnos quedarán fuera del nuevo horario. Podés guardar el cambio: los turnos se conservarán y Recepción deberá gestionarlos."}</p>
          <ul className="turnos-afectados">
            {turnos.map((turno) => (
              <li key={turno.id_turno}>
                <Link href={`/turnos/${turno.id_turno}`} target="_blank" rel="noopener noreferrer">{turno.paciente || "Ver turno"}</Link>
                {turno.dni_paciente && <span> · DNI {turno.dni_paciente}</span>}
                <div>{formatearFecha(turno.fecha)} · {turno.hora_inicio}–{turno.hora_fin}</div>
                <div>{turno.servicio} · Confirmado</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
