"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { confirmarRepeticion, previsualizarRepeticion } from "@/lib/turnos/actions";
import type { EstadoConfirmarRepetir, EstadoPreviaRepetir, PedidoRepetir } from "@/lib/turnos/tipos";
import { DIAS_REPETIR, isoDow, MAXIMO_TURNOS_REPETIR } from "@/lib/turnos/validar";

const inicialPrevia: EstadoPreviaRepetir = { error: null, pedido: null, fechas: null };
const inicialConfirmar: EstadoConfirmarRepetir = { error: null, resultado: null };

function diaSemana(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${fecha}T00:00:00Z`)
  );
}

function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${fecha}T00:00:00Z`));
}

function mismoPedido(a: PedidoRepetir, b: PedidoRepetir): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// HU-25 / HU-37. Repetir el turno cada semana, en los días elegidos.
// Por defecto queda marcado solo el día del turno original y su hora.
export function RepetirTurnoForm({
  idTurno,
  fecha,
  horaInicio,
  diasLaborales,
  abiertoInicial = false,
}: {
  idTurno: string;
  fecha: string;
  horaInicio: string;
  diasLaborales: number[]; // días (1 = lunes … 7 = domingo) en los que el profesional tiene franja
  abiertoInicial?: boolean;
}) {
  const diaOriginal = isoDow(fecha);
  const diasVisibles = DIAS_REPETIR.filter(
    (dia) => diasLaborales.includes(dia.valor) || dia.valor === diaOriginal
  );
  const trabaja = (diasElegidos: number[]) => diasElegidos.every((dia) => diasVisibles.some((v) => v.valor === dia));
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [dias, setDias] = useState<number[]>([diaOriginal]);
  const [horas, setHoras] = useState<Record<number, string>>({ [diaOriginal]: horaInicio });
  const [modo, setModo] = useState<"semanas" | "sesiones">("semanas");
  const [cantidad, setCantidad] = useState("4");
  const [previa, verFechas, buscando] = useActionState(previsualizarRepeticion, inicialPrevia);
  const [final, confirmar, confirmando] = useActionState(confirmarRepeticion, inicialConfirmar);

  const pedido: PedidoRepetir = {
    modo,
    cantidad: cantidad.trim(),
    dias,
    horas: dias.map((d) => horas[d] ?? horaInicio),
  };

  function marcar(dia: number, activo: boolean) {
    setDias((actual) => {
      if (activo) return [...actual, dia].sort((a, b) => a - b);
      return actual.filter((d) => d !== dia);
    });
    setHoras((actual) => ({ ...actual, [dia]: actual[dia] ?? horaInicio }));
  }

  function atajo(elegidos: number[]) {
    setDias([...elegidos].sort((a, b) => a - b));
    setHoras((actual) => {
      const siguiente = { ...actual };
      for (const dia of elegidos) siguiente[dia] = siguiente[dia] ?? horaInicio;
      return siguiente;
    });
  }

  function enviarPrevia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => verFechas(datos));
  }

  const ocupado = buscando || confirmando;
  const disponibles = previa.fechas?.filter((f) => f.disponible).length ?? 0;
  const previewViejo =
    previa.fechas !== null && previa.pedido !== null && !mismoPedido(pedido, previa.pedido);
  const resultado = final.resultado;

  if (!abierto) {
    return (
      <button className="boton-secundario boton-inline" type="button" onClick={() => setAbierto(true)}>
        Repetir semanalmente
      </button>
    );
  }

  return (
    <div className="tarjeta form-repetir">
      <h3>Repetir semanalmente</h3>
      <p className="texto-suave">
        Mismo paciente, profesional, servicio y cobertura. Elegí los días de la semana y la hora de
        cada uno. Cada turno queda independiente.
      </p>

      {resultado ? (
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
                    {turno.hora_inicio ? ` · ${turno.hora_inicio}` : ""}
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
                  <li key={`${omitido.fecha}-${omitido.hora_inicio ?? ""}`}>
                    {diaSemana(omitido.fecha)} {fechaCorta(omitido.fecha)}
                    {omitido.hora_inicio ? ` ${omitido.hora_inicio}` : ""}: {omitido.motivo}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="fila-acciones">
            <button className="boton-secundario boton-inline" type="button" onClick={() => setAbierto(false)}>
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <>
          <form className="login-form" onSubmit={enviarPrevia}>
            <input type="hidden" name="id_turno" value={idTurno} />
            <input type="hidden" name="modo" value={modo} />
            <input type="hidden" name="cantidad" value={cantidad} />
            {dias.map((dia) => (
              <input key={dia} type="hidden" name="dia" value={dia} />
            ))}
            {dias.map((dia) => (
              <input key={`h-${dia}`} type="hidden" name="hora" value={horas[dia] ?? horaInicio} />
            ))}

            <p className="texto-suave">Días de la semana</p>
            <div className="fila-acciones">
              <button className="boton-pill" type="button" onClick={() => atajo([diaOriginal])}>
                Mismo día
              </button>
              {trabaja([1, 3, 5]) && (
                <button className="boton-pill" type="button" onClick={() => atajo([1, 3, 5])}>
                  Lunes, miércoles y viernes
                </button>
              )}
              {trabaja([2, 4]) && (
                <button className="boton-pill" type="button" onClick={() => atajo([2, 4])}>
                  Martes y jueves
                </button>
              )}
            </div>
            <div className="dias-semana">
              {diasVisibles.map((dia) => (
                <label key={dia.valor}>
                  <input
                    type="checkbox"
                    checked={dias.includes(dia.valor)}
                    onChange={(e) => marcar(dia.valor, e.target.checked)}
                  />{" "}
                  {dia.etiqueta}
                </label>
              ))}
            </div>
            {dias.map((dia) => (
              <div className="campo" key={`hora-${dia}`}>
                <label htmlFor={`hora-${dia}`}>Hora del {DIAS_REPETIR[dia - 1].etiqueta.toLowerCase()}</label>
                <input
                  id={`hora-${dia}`}
                  type="time"
                  value={horas[dia] ?? horaInicio}
                  onChange={(e) => setHoras((actual) => ({ ...actual, [dia]: e.target.value }))}
                  required
                />
              </div>
            ))}

            <div className="campo">
              <label htmlFor="modo_repetir">Hasta cuándo</label>
              <select
                id="modo_repetir"
                value={modo}
                onChange={(e) => setModo(e.target.value as "semanas" | "sesiones")}
              >
                <option value="semanas">Cantidad de semanas</option>
                <option value="sesiones">Cantidad de sesiones</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="cantidad_repetir">
                {modo === "semanas" ? "Semanas (1 a 24, según los días)" : "Sesiones (1 a 24)"}
              </label>
              <input
                id="cantidad_repetir"
                type="number"
                min={1}
                max={MAXIMO_TURNOS_REPETIR}
                step={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
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

          {previa.fechas && previa.pedido && (
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
                      <tr key={`${f.fecha}-${f.hora_inicio}`}>
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

              <form action={confirmar}>
                <input type="hidden" name="id_turno" value={idTurno} />
                <input type="hidden" name="modo" value={previa.pedido.modo} />
                <input type="hidden" name="cantidad" value={previa.pedido.cantidad} />
                {previa.pedido.dias.map((dia) => (
                  <input key={dia} type="hidden" name="dia" value={dia} />
                ))}
                {previa.pedido.horas.map((hora, i) => (
                  <input key={`${previa.pedido?.dias[i]}-${hora}`} type="hidden" name="hora" value={hora} />
                ))}
                <p className="texto-suave">
                  {previewViejo
                    ? "Cambiaste los días o la cantidad: tocá «Ver fechas» para actualizar la lista."
                    : disponibles === 0
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
                    disabled={ocupado || disponibles === 0 || previewViejo}
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
