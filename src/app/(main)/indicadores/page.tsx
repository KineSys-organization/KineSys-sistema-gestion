import Link from "next/link";
import { exigirGerente } from "@/lib/auth";
import { obtenerIndicadores } from "@/lib/indicadores/actions";
import {
  formatearFechaCorta,
  formatearMinutos,
  formatearPorcentaje,
  periodoPorDefecto,
  periodosRapidos,
  type Periodo,
} from "@/lib/indicadores/validar";
import { hoyArgentina } from "@/lib/atencion/validar";

type Props = {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
};

const urlPeriodo = (periodo: Periodo) =>
  `/indicadores?desde=${periodo.desde}&hasta=${periodo.hasta}`;

// HU-26. Indicadores generales del centro para un período (solo Gerente).
// El período va en la URL: se puede recargar o compartir. Sin parámetros abre el mes actual.
export default async function IndicadoresPage({ searchParams }: Props) {
  await exigirGerente();
  const params = await searchParams;

  const hoy = hoyArgentina();
  const porDefecto = periodoPorDefecto(hoy);
  const periodo: Periodo = {
    desde: params.desde ?? porDefecto.desde,
    hasta: params.hasta ?? porDefecto.hasta,
  };

  const { data, error } = await obtenerIndicadores(periodo);

  // Tarjetas del resumen: turnos por estado y pacientes nuevos.
  const tarjetas = data
    ? [
        { titulo: "Turnos registrados", valor: data.turnos.total, detalle: "Todos los estados" },
        { titulo: "Atendidos", valor: data.turnos.atendidos, detalle: "Atención registrada" },
        { titulo: "Cancelados", valor: data.turnos.cancelados, detalle: "Liberaron el horario" },
        { titulo: "Ausentes", valor: data.turnos.ausentes, detalle: "El paciente no vino" },
        { titulo: "Confirmados", valor: data.turnos.confirmados, detalle: "Pendientes de atender" },
        { titulo: "Pacientes nuevos", valor: data.pacientes_nuevos, detalle: "Dados de alta en el período" },
      ]
    : [];

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Indicadores</h2>
          <p className="texto-suave">Cómo viene el consultorio en el período que elijas.</p>
        </div>
      </div>

      <form className="tarjeta bloque filtro-fecha" method="get">
        <div className="campo">
          <label htmlFor="desde">Desde</label>
          <input id="desde" name="desde" type="date" defaultValue={periodo.desde} required />
        </div>
        <div className="campo">
          <label htmlFor="hasta">Hasta</label>
          <input id="hasta" name="hasta" type="date" defaultValue={periodo.hasta} required />
        </div>
        <button className="boton-principal boton-inline" type="submit">
          Ver indicadores
        </button>
        <div className="fila-acciones">
          {periodosRapidos(hoy).map((rapido) => (
            <Link key={rapido.texto} className="boton-pill" href={urlPeriodo(rapido.periodo)}>
              {rapido.texto}
            </Link>
          ))}
        </div>
      </form>

      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          <p className="texto-suave">
            Período: {formatearFechaCorta(data.desde)} al {formatearFechaCorta(data.hasta)}
          </p>

          <div className="indicadores-grid bloque">
            {tarjetas.map((tarjeta) => (
              <div key={tarjeta.titulo} className="tarjeta indicador">
                <span className="indicador-titulo">{tarjeta.titulo}</span>
                <strong className="indicador-valor">{tarjeta.valor}</strong>
                <span className="indicador-detalle">{tarjeta.detalle}</span>
              </div>
            ))}
          </div>

          <section className="tarjeta">
            <div className="modulo-cabecera">
              <div>
                <h3>Tasa de ocupación</h3>
                <p className="texto-suave">
                  Horas ocupadas por turnos confirmados, atendidos o ausentes sobre las horas
                  de atención de cada profesional (sus franjas horarias).
                </p>
              </div>
              <div className="indicador-general">
                <strong className="indicador-valor">
                  {formatearPorcentaje(data.ocupacion.porcentaje)}
                </strong>
                <span className="indicador-detalle">
                  {formatearMinutos(data.ocupacion.minutos_ocupados)} de{" "}
                  {formatearMinutos(data.ocupacion.minutos_disponibles)}
                </span>
              </div>
            </div>

            {data.profesionales.length === 0 ? (
              <p className="texto-suave">No hay profesionales activos.</p>
            ) : (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Profesional</th>
                      <th>Turnos</th>
                      <th>Horas disponibles</th>
                      <th>Horas ocupadas</th>
                      <th>Ocupación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.profesionales.map((p) => (
                      <tr key={p.id_profesional}>
                        <td>
                          {p.apellido_profesional}, {p.nombre_profesional}
                        </td>
                        <td>{p.turnos}</td>
                        <td>{formatearMinutos(p.minutos_disponibles)}</td>
                        <td>{formatearMinutos(p.minutos_ocupados)}</td>
                        <td>
                          <div className="ocupacion">
                            <span
                              className="barra-ocupacion"
                              role="progressbar"
                              aria-label={`Ocupación de ${p.apellido_profesional}, ${p.nombre_profesional}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={p.porcentaje}
                            >
                              <span style={{ width: `${Math.min(p.porcentaje, 100)}%` }} />
                            </span>
                            {formatearPorcentaje(p.porcentaje)}
                          </div>
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
