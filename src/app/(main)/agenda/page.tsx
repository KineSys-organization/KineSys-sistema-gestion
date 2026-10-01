import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { listarProfesionalesParaAgenda, obtenerAgenda } from "@/lib/agenda/actions";
import { esFechaValida, hoyArgentina, sumarDias } from "@/lib/atencion/validar";
// HU-28: "Otorgar turno" desde la agenda va al paso 1 (paciente) con profesional y día ya elegidos.
import { urlPasoPaciente } from "@/lib/turnos/flujo";
import { formatearFecha } from "@/lib/turnos/validar";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import { obtenerDiasSemana } from "@/lib/agenda/semana";
import type { TurnoAgenda } from "@/lib/agenda/tipos";

type Props = {
  searchParams: Promise<{ profesional?: string; fecha?: string; vista?: string }>;
};

function TablaTurnos({ turnos }: { turnos: TurnoAgenda[] }) {
  return (
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
                <EstadoTurnoBadge
                  estado={turno.estado}
                  motivoCancelacion={turno.motivo_cancelacion}
                />
              </td>
              <td>
                <Link className="boton-pill" href={`/turnos/${turno.id_turno}`}>
                  Ver turno
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AgendaPage({ searchParams }: Props) {
  await exigirRecepcion();
  const params = await searchParams;
  const { data: profesionales, error: errorProfesionales } =
    await listarProfesionalesParaAgenda();

  const hoy = hoyArgentina();
  const fecha = params.fecha && esFechaValida(params.fecha) ? params.fecha : hoy;
  const vista = params.vista === "semana" ? "semana" : "dia";
  const profesional =
    profesionales.find((p) => p.id_usuario === params.profesional) ?? profesionales[0];

  const diasSemana = vista === "semana" ? obtenerDiasSemana(fecha) : [];
  const agendasSemana =
    profesional && vista === "semana"
      ? await Promise.all(
          diasSemana.map((dia) =>
            obtenerAgenda({ id_profesional: profesional.id_usuario, fecha: dia })
          )
        )
      : [];
  const agenda =
    profesional && vista === "dia"
      ? await obtenerAgenda({ id_profesional: profesional.id_usuario, fecha })
      : null;
  const turnos = agenda?.data?.turnos ?? [];

  const urlAgenda = (dia: string, modo = vista) =>
    `/agenda?profesional=${encodeURIComponent(profesional?.id_usuario ?? "")}&fecha=${dia}&vista=${modo}`;
  const desplazamiento = vista === "semana" ? 7 : 1;

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Agenda</h2>
          <p className="texto-suave">Consultá los turnos de un profesional por día o semana.</p>
        </div>
        {profesional && (
          <Link
            className="boton-principal boton-inline"
            href={urlPasoPaciente({ profesional: profesional.id_usuario, fecha })}
          >
            Otorgar turno
          </Link>
        )}
      </div>

      {errorProfesionales && (
        <p className="mensaje-error" role="alert">
          {errorProfesionales}
        </p>
      )}

      {!profesional ? (
        <p className="texto-suave">No hay profesionales activos para consultar.</p>
      ) : (
        <>
          <form className="tarjeta bloque filtro-fecha" action="/agenda" method="get">
            <div className="campo">
              <label htmlFor="profesional">Profesional</label>
              <select
                id="profesional"
                name="profesional"
                defaultValue={profesional.id_usuario}
              >
                {profesionales.map((p) => (
                  <option key={p.id_usuario} value={p.id_usuario}>
                    {p.apellido_usuario}, {p.nombre_usuario}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="fecha">Fecha</label>
              <input id="fecha" name="fecha" type="date" defaultValue={fecha} required />
            </div>
            <input type="hidden" name="vista" value={vista} />
            <button className="boton-principal boton-inline" type="submit">
              Ver agenda
            </button>
            <div className="agenda-controles">
              <nav className="fila-acciones" aria-label="Tipo de vista de agenda">
                <Link
                  className={`boton-pill${vista === "dia" ? " boton-pill-fuerte" : ""}`}
                  href={urlAgenda(fecha, "dia")}
                  aria-current={vista === "dia" ? "page" : undefined}
                >
                  Día
                </Link>
                <Link
                  className={`boton-pill${vista === "semana" ? " boton-pill-fuerte" : ""}`}
                  href={urlAgenda(fecha, "semana")}
                  aria-current={vista === "semana" ? "page" : undefined}
                >
                  Semana
                </Link>
              </nav>
              <nav className="fila-acciones" aria-label="Navegación de agenda">
                <Link
                  className="boton-pill"
                  href={urlAgenda(sumarDias(fecha, -desplazamiento))}
                >
                  {vista === "semana" ? "← Semana anterior" : "← Día anterior"}
                </Link>
                {fecha !== hoy && (
                  <Link className="boton-pill" href={urlAgenda(hoy)}>
                    Hoy
                  </Link>
                )}
                <Link
                  className="boton-pill"
                  href={urlAgenda(sumarDias(fecha, desplazamiento))}
                >
                  {vista === "semana" ? "Semana siguiente →" : "Día siguiente →"}
                </Link>
              </nav>
            </div>
          </form>

          {vista === "dia" ? (
            <section className="tarjeta">
              <div className="modulo-cabecera">
                <h3>
                  {profesional.apellido_usuario}, {profesional.nombre_usuario} ·{" "}
                  {formatearFecha(fecha)}
                  {fecha === hoy && <span className="badge-hoy">Hoy</span>}
                </h3>
                {turnos.length > 0 && (
                  <p className="texto-suave">
                    {turnos.length} {turnos.length === 1 ? "turno" : "turnos"}
                  </p>
                )}
              </div>

              {agenda?.error ? (
                <p className="mensaje-error" role="alert">
                  {agenda.error}
                </p>
              ) : turnos.length === 0 ? (
                <p className="texto-suave">No hay turnos para ese profesional en esa fecha.</p>
              ) : (
                <TablaTurnos turnos={turnos} />
              )}
            </section>
          ) : (
            <div className="agenda-semana">
              {diasSemana.map((dia, indice) => {
                const agendaDia = agendasSemana[indice];
                const turnosDia = agendaDia?.data?.turnos ?? [];

                return (
                  <section className="tarjeta agenda-dia" key={dia}>
                    <div className="modulo-cabecera">
                      <h3>
                        {formatearFecha(dia)}
                        {dia === hoy && <span className="badge-hoy">Hoy</span>}
                      </h3>
                      <p className="texto-suave">
                        {turnosDia.length} {turnosDia.length === 1 ? "turno" : "turnos"}
                      </p>
                    </div>
                    {agendaDia?.error ? (
                      <p className="mensaje-error" role="alert">
                        {agendaDia.error}
                      </p>
                    ) : turnosDia.length === 0 ? (
                      <p className="texto-suave">No hay turnos para este día.</p>
                    ) : (
                      <TablaTurnos turnos={turnosDia} />
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
