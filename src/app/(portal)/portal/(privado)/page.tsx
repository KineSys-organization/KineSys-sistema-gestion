import Link from "next/link";
import { exigirPaciente } from "@/lib/portal/acceso";
import { obtenerMisTurnos } from "@/lib/portal/actions";
import type { TurnoPortal } from "@/lib/portal/tipos";
import { formatearFecha } from "@/lib/turnos/validar";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import { CancelarTurnoPortalForm } from "@/components/portal/CancelarTurnoPortalForm";

type Props = {
  searchParams: Promise<{ nuevo?: string; cancelado?: string }>;
};

// HU-23. "Mis turnos": próximos (con cancelar) e historial reciente. Sin datos clínicos ni pagos.
export default async function MisTurnosPage({ searchParams }: Props) {
  await exigirPaciente();
  const params = await searchParams;
  const { data, error } = await obtenerMisTurnos();

  const nuevo = data?.proximos.find((t) => t.id_turno === params.nuevo);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Mis turnos</h2>
          <p className="texto-suave">Tus próximos turnos y los últimos que tuviste.</p>
        </div>
        <Link className="boton-principal boton-inline" href="/portal/nuevo">
          Sacar turno
        </Link>
      </div>

      {nuevo && (
        <p className="mensaje-ok" role="status">
          Listo, tu turno quedó confirmado: {formatearFecha(nuevo.fecha)} a las{" "}
          {nuevo.hora_inicio} con {nuevo.nombre_profesional} {nuevo.apellido_profesional}.
        </p>
      )}
      {params.cancelado && (
        <p className="mensaje-ok" role="status">
          Cancelaste el turno. El horario quedó libre para otro paciente.
        </p>
      )}
      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          <section className="tarjeta bloque">
            <h3>Próximos</h3>
            {data.proximos.length === 0 ? (
              <p className="texto-suave">
                No tenés turnos próximos. <Link href="/portal/nuevo">Sacá uno</Link>.
              </p>
            ) : (
              <TablaTurnos turnos={data.proximos} conAcciones />
            )}
          </section>

          <section className="tarjeta bloque">
            <h3>Anteriores</h3>
            {data.anteriores.length === 0 ? (
              <p className="texto-suave">Todavía no tenés turnos anteriores.</p>
            ) : (
              <TablaTurnos turnos={data.anteriores} />
            )}
          </section>
        </>
      )}
    </section>
  );
}

function TablaTurnos({ turnos, conAcciones = false }: { turnos: TurnoPortal[]; conAcciones?: boolean }) {
  return (
    <div className="tabla-scroll">
      <table className="tabla">
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Horario</th>
            <th scope="col">Servicio</th>
            <th scope="col">Profesional</th>
            <th scope="col">Cobertura</th>
            <th scope="col">Estado</th>
            {conAcciones && <th scope="col">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {turnos.map((t) => (
            <tr key={t.id_turno}>
              <td>{formatearFecha(t.fecha)}</td>
              <td>
                {t.hora_inicio} a {t.hora_fin}
              </td>
              <td>{t.nombre_servicio}</td>
              <td>
                {t.nombre_profesional} {t.apellido_profesional}
              </td>
              <td>
                {t.cobertura}
                {t.numero_afiliado && <span className="texto-suave"> · nº {t.numero_afiliado}</span>}
              </td>
              <td>
                <EstadoTurnoBadge estado={t.estado} />
              </td>
              {conAcciones && (
                <td>{t.cancelable ? <CancelarTurnoPortalForm idTurno={t.id_turno} /> : "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
