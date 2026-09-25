import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { listarProfesionalesParaAgenda, obtenerAgenda } from "@/lib/agenda/actions";
import { esFechaValida, hoyArgentina, sumarDias } from "@/lib/atencion/validar";
import { urlDisponibilidad } from "@/lib/disponibilidad/calendario";
import { formatearFecha } from "@/lib/turnos/validar";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";

type Props = {
  searchParams: Promise<{ profesional?: string; fecha?: string }>;
};

// HU-07. Agenda de un profesional para una fecha (Recepción).
// Profesional y fecha van en la URL: abre directo en el día de hoy y se puede
// linkear desde el resumen del turno ("Ver agenda del día").
export default async function AgendaPage({ searchParams }: Props) {
  await exigirRecepcion();
  const params = await searchParams;
  const { data: profesionales, error: errorProfesionales } =
    await listarProfesionalesParaAgenda();

  const hoy = hoyArgentina();
  const fecha = params.fecha && esFechaValida(params.fecha) ? params.fecha : hoy;
  const profesional =
    profesionales.find((p) => p.id_usuario === params.profesional) ?? profesionales[0];

  const agenda = profesional
    ? await obtenerAgenda({ id_profesional: profesional.id_usuario, fecha })
    : null;
  const turnos = agenda?.data?.turnos ?? [];

  const urlDia = (dia: string) =>
    `/agenda?profesional=${profesional?.id_usuario ?? ""}&fecha=${dia}`;

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Agenda</h2>
          <p className="texto-suave">Turnos de un profesional para un día.</p>
        </div>
        {profesional && (
          <Link
            className="boton-principal boton-inline"
            href={urlDisponibilidad({ profesional: profesional.id_usuario, fecha })}
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
          <form className="tarjeta bloque filtro-fecha" method="get">
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
            <button className="boton-principal boton-inline" type="submit">
              Ver agenda
            </button>
            <div className="fila-acciones">
              <Link className="boton-pill" href={urlDia(sumarDias(fecha, -1))}>
                ← Día anterior
              </Link>
              {fecha !== hoy && (
                <Link className="boton-pill" href={urlDia(hoy)}>
                  Hoy
                </Link>
              )}
              <Link className="boton-pill" href={urlDia(sumarDias(fecha, 1))}>
                Día siguiente →
              </Link>
            </div>
          </form>

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
                      // HU-10A: los cancelados se ven atenuados y no ocupan el horario.
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
            )}
          </section>
        </>
      )}
    </section>
  );
}
