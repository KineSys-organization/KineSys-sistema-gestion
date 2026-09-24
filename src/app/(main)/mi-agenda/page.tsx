import Link from "next/link";
import { exigirProfesional } from "@/lib/auth";
import { consultarMiAgenda } from "@/lib/atencion/actions";
import { esFechaValida, hoyArgentina, sumarDias } from "@/lib/atencion/validar";
import { etiquetaMotivo, formatearFecha } from "@/lib/turnos/validar";
import type { TurnoAgenda } from "@/lib/agenda/tipos";

type Props = {
  searchParams: Promise<{ fecha?: string }>;
};

function EstadoTurno({ turno }: { turno: TurnoAgenda }) {
  if (turno.estado === "atendido") return <span className="badge-atendido">Atendido</span>;
  if (turno.estado === "cancelado") {
    return (
      <span className="badge-cancelado" title={etiquetaMotivo(turno.motivo_cancelacion)}>
        Cancelado
      </span>
    );
  }
  if (turno.estado === "ausente") return <span className="badge-inactivo">Ausente</span>;
  return <span className="badge-activo">Confirmado</span>;
}

// HU-12. Agenda del profesional logueado: solo sus turnos (lo garantiza la base).
// La fecha va en la URL (?fecha=), así "Volver" y recargar mantienen el día.
export default async function MiAgendaPage({ searchParams }: Props) {
  await exigirProfesional();

  const hoy = hoyArgentina();
  const { fecha: fechaParam } = await searchParams;
  const pedida = (fechaParam ?? "").trim();
  const fecha = pedida && esFechaValida(pedida) ? pedida : hoy;
  const fechaInvalida = pedida !== "" && !esFechaValida(pedida);

  const { data, error } = await consultarMiAgenda(fecha);
  const turnos = data?.turnos ?? [];
  const pendientes = turnos.filter((t) => t.atendible).length;
  const esHoy = fecha === hoy;

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Mi agenda</h2>
          <p className="texto-suave">Tus turnos y tus pacientes del día.</p>
        </div>
      </div>

      <div className="tarjeta bloque">
        <form className="filtro-fecha" method="get">
          <div className="campo">
            <label htmlFor="fecha">Fecha</label>
            <input id="fecha" name="fecha" type="date" defaultValue={fecha} required />
          </div>
          <button className="boton-pill boton-pill-fuerte" type="submit">
            Ver día
          </button>
          <div className="fila-acciones">
            <Link className="boton-pill" href={`/mi-agenda?fecha=${sumarDias(fecha, -1)}`}>
              ← Día anterior
            </Link>
            {!esHoy && (
              <Link className="boton-pill" href="/mi-agenda">
                Hoy
              </Link>
            )}
            <Link className="boton-pill" href={`/mi-agenda?fecha=${sumarDias(fecha, 1)}`}>
              Día siguiente →
            </Link>
          </div>
        </form>
        {fechaInvalida && (
          <p className="mensaje-error" role="alert">
            La fecha no es válida. Se muestra el día de hoy.
          </p>
        )}
      </div>

      <section className="tarjeta">
        <div className="modulo-cabecera">
          <h3>
            {formatearFecha(fecha)}
            {esHoy && <span className="badge-hoy">Hoy</span>}
          </h3>
          {data && turnos.length > 0 && (
            <p className="texto-suave">
              {turnos.length} {turnos.length === 1 ? "turno" : "turnos"}
              {esHoy && ` · ${pendientes} por atender`}
            </p>
          )}
        </div>

        {error ? (
          <p className="mensaje-error" role="alert">
            {error}
          </p>
        ) : turnos.length === 0 ? (
          <p className="texto-suave">No tenés turnos para este día.</p>
        ) : (
          // En pantallas angostas la tabla scrollea dentro de la tarjeta, no toda la página.
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Horario</th>
                  <th>Paciente</th>
                  <th>DNI</th>
                  <th>Servicio</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {turnos.map((turno) => (
                  <tr
                    key={turno.id_turno}
                    className={turno.estado === "cancelado" ? "fila-cancelada" : undefined}
                  >
                    <td>
                      {turno.hora_inicio} a {turno.hora_fin}
                    </td>
                    <td>
                      {turno.apellido_paciente}, {turno.nombre_paciente}
                    </td>
                    <td>{turno.dni_paciente}</td>
                    <td>{turno.nombre_servicio}</td>
                    <td>
                      <EstadoTurno turno={turno} />
                    </td>
                    <td>
                      <Link
                        className={
                          turno.atendible ? "boton-pill boton-pill-fuerte" : "boton-texto"
                        }
                        href={`/mi-agenda/${turno.id_turno}`}
                      >
                        {turno.atendible ? "Atender" : "Ver turno"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
