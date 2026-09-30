"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { confirmarRepeticion, previsualizarRepeticion } from "@/lib/turnos/actions";
import type { EstadoConfirmarRepetir, EstadoPreviaRepetir } from "@/lib/turnos/tipos";
import { MAXIMO_SEMANAS_REPETIR } from "@/lib/turnos/validar";

const inicialPrevia: EstadoPreviaRepetir = { error: null, semanas: "4", fechas: null };
const inicialConfirmar: EstadoConfirmarRepetir = { error: null, resultado: null };

// "2026-10-05" -> "lunes" y "05/10/2026". En UTC para que no se corra el día.
function diaSemana(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${fecha}T00:00:00Z`)
  );
}

function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "UTC" }).format(
    new Date(`${fecha}T00:00:00Z`)
  );
}

// HU-25. Repetir el turno las próximas semanas (mismo día y hora).
// 1) Recepción indica cuántas semanas → 2) "Ver fechas" muestra el preview (no crea nada)
// → 3) "Confirmar" crea solo las fechas libres → 4) resultado con lo que no se creó.
// Es cliente por el estado (abierto/cerrado y el resultado de las dos actions).
export function RepetirTurnoForm({
  idTurno,
  abiertoInicial = false,
}: {
  idTurno: string;
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [previa, verFechas, buscando] = useActionState(previsualizarRepeticion, inicialPrevia);
  const [final, confirmar, confirmando] = useActionState(confirmarRepeticion, inicialConfirmar);

  // Mientras corre cualquiera de los dos pasos no se puede enviar nada (evita el doble envío).
  const ocupado = buscando || confirmando;

  if (!abierto) {
    return (
      <button
        className="boton-secundario boton-inline"
        type="button"
        onClick={() => setAbierto(true)}
      >
        Repetir semanalmente
      </button>
    );
  }

  const disponibles = previa.fechas?.filter((f) => f.disponible).length ?? 0;
  const resultado = final.resultado;

  return (
    <div className="tarjeta form-repetir">
      <h3>Repetir semanalmente</h3>
      <p className="texto-suave">
        Mismo paciente, profesional, servicio, cobertura, día de la semana y hora. Cada turno
        queda independiente: cancelar o reprogramar uno no cambia los demás.
      </p>

      {resultado ? (
        // ---------- Paso 4: resultado ----------
        <div className="resultado-repetir">
          <p className="mensaje-ok" role="status">
            {resultado.creados.length === 1
              ? "Se creó 1 turno."
              : `Se crearon ${resultado.creados.length} turnos.`}
          </p>

          {resultado.creados.length > 0 && (
            <ul className="lista-repetir">
              {resultado.creados.map((turno) => (
                <li key={turno.id_turno}>
                  <Link href={`/turnos/${turno.id_turno}`}>
                    {diaSemana(turno.fecha)} {fechaCorta(turno.fecha)}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {resultado.omitidos.length > 0 && (
            <>
              <p className="mensaje-error" role="alert">
                No se crearon {resultado.omitidos.length} de las fechas pedidas:
              </p>
              <ul className="lista-repetir">
                {resultado.omitidos.map((omitido) => (
                  <li key={omitido.fecha}>
                    {diaSemana(omitido.fecha)} {fechaCorta(omitido.fecha)}: {omitido.motivo}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="fila-acciones">
            <button
              className="boton-secundario boton-inline"
              type="button"
              onClick={() => setAbierto(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ---------- Pasos 1 y 2: semanas + preview ---------- */}
          <form className="form-semanas" action={verFechas}>
            <input type="hidden" name="id_turno" value={idTurno} />
            <div className="campo">
              <label htmlFor="semanas">Semanas a repetir (1 a {MAXIMO_SEMANAS_REPETIR})</label>
              <input
                id="semanas"
                name="semanas"
                type="number"
                min={1}
                max={MAXIMO_SEMANAS_REPETIR}
                step={1}
                defaultValue={previa.semanas}
                required
              />
            </div>
            <div className="fila-acciones">
              <button className="boton-principal boton-inline" type="submit" disabled={ocupado}>
                {buscando ? "Buscando fechas..." : "Ver fechas"}
              </button>
              <button
                className="boton-secundario boton-inline"
                type="button"
                disabled={ocupado}
                onClick={() => setAbierto(false)}
              >
                Volver
              </button>
            </div>
          </form>

          {previa.error && (
            <p className="mensaje-error" role="alert">
              {previa.error}
            </p>
          )}

          {previa.fechas && (
            <>
              <div className="tabla-scroll">
                <table className="tabla tabla-repetir">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Día</th>
                      <th>Hora</th>
                      <th>Estado</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.fechas.map((f) => (
                      <tr key={f.fecha}>
                        <td>{fechaCorta(f.fecha)}</td>
                        <td>{diaSemana(f.fecha)}</td>
                        <td>
                          {f.hora_inicio} a {f.hora_fin}
                        </td>
                        <td>
                          <span className={f.disponible ? "badge-activo" : "badge-cancelado"}>
                            {f.disponible ? "Disponible" : "No disponible"}
                          </span>
                        </td>
                        <td>{f.motivo ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ---------- Paso 3: confirmar ---------- */}
              <form action={confirmar}>
                <input type="hidden" name="id_turno" value={idTurno} />
                {/* Las semanas del preview que se está viendo, no las del input. */}
                <input type="hidden" name="semanas" value={previa.semanas} />
                <p className="texto-suave">
                  {disponibles === 0
                    ? "No hay fechas disponibles para crear."
                    : "Se crean solo las fechas disponibles. Cada una se vuelve a validar al confirmar."}
                </p>
                {final.error && (
                  <p className="mensaje-error" role="alert">
                    {final.error}
                  </p>
                )}
                <div className="fila-acciones">
                  <button
                    className="boton-principal boton-inline"
                    type="submit"
                    disabled={ocupado || disponibles === 0}
                  >
                    {confirmando
                      ? "Creando turnos..."
                      : `Confirmar ${disponibles} ${disponibles === 1 ? "turno" : "turnos"}`}
                  </button>
                </div>
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}
