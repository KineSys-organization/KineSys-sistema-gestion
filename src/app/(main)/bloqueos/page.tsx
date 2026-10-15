import { exigirGerente } from "@/lib/auth";
import { listarBloqueos } from "@/lib/bloqueos/actions";
import { listarProfesionales } from "@/lib/profesionales/actions";
import { hoyArgentina } from "@/lib/atencion/validar";
import { formatearFecha } from "@/lib/turnos/validar";
import { BloqueoForm } from "@/components/bloqueos/BloqueoForm";
import { EliminarBloqueo } from "@/components/bloqueos/EliminarBloqueo";

// HU-33. Bloqueos vigentes y futuros. Solo el Gerente crea y elimina.
export default async function BloqueosPage() {
  await exigirGerente();
  const [{ data: bloqueos, error }, { data: profesionales, error: errorProfesionales }] =
    await Promise.all([listarBloqueos(), listarProfesionales()]);

  const activos = profesionales.filter((p) => p.activo);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Bloqueos de agenda</h2>
          <p className="texto-suave">
            Feriados y cierres del centro, o licencias de un profesional. Un horario bloqueado no
            se ofrece para turnos nuevos.
          </p>
        </div>
      </div>

      {(error || errorProfesionales) && (
        <p className="mensaje-error" role="alert">
          {error ?? errorProfesionales}
        </p>
      )}

      <BloqueoForm hoy={hoyArgentina()} profesionales={activos} />

      {bloqueos.length === 0 ? (
        <p className="texto-suave">No hay bloqueos vigentes ni futuros.</p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Alcance</th>
                <th>Fechas</th>
                <th>Horario</th>
                <th>Motivo</th>
                <th>Cargado por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bloqueos.map((bloqueo) => (
                <tr key={bloqueo.id_bloqueo}>
                  <td>
                    {bloqueo.alcance === "centro"
                      ? "Todo el centro"
                      : `${bloqueo.apellido_profesional}, ${bloqueo.nombre_profesional}`}
                  </td>
                  <td>
                    {formatearFecha(bloqueo.fecha_desde)}
                    {bloqueo.fecha_hasta !== bloqueo.fecha_desde &&
                      ` al ${formatearFecha(bloqueo.fecha_hasta)}`}
                  </td>
                  <td>
                    {bloqueo.dia_completo
                      ? "Día completo"
                      : `${bloqueo.hora_desde} a ${bloqueo.hora_hasta}`}
                  </td>
                  <td>{bloqueo.motivo}</td>
                  <td>
                    {bloqueo.nombre_creador} {bloqueo.apellido_creador}
                  </td>
                  <td>
                    {bloqueo.eliminable ? (
                      <EliminarBloqueo id={bloqueo.id_bloqueo} />
                    ) : (
                      <span className="texto-suave">Ya empezó</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
