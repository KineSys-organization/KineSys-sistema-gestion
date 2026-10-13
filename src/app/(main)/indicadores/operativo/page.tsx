import Link from "next/link";
import { exigirGerente } from "@/lib/auth";
import { obtenerDashboardOperativo } from "@/lib/indicadores/actions";
import {
  formatearFechaCorta,
  periodoPorDefecto,
  periodosRapidos,
  type Periodo,
} from "@/lib/indicadores/validar";
import { hoyArgentina } from "@/lib/atencion/validar";

type Props = {
  searchParams: Promise<{ desde?: string | string[]; hasta?: string | string[] }>;
};

const primero = (valor?: string | string[]) => (Array.isArray(valor) ? valor[0] : valor);

const urlPeriodo = (periodo: Periodo) =>
  `/indicadores/operativo?desde=${periodo.desde}&hasta=${periodo.hasta}`;

const estadosTurno = [
  { clave: "confirmados", nombre: "Confirmados", clase: "estado-confirmado" },
  { clave: "atendidos", nombre: "Atendidos", clase: "estado-atendido" },
  { clave: "cancelados", nombre: "Cancelados", clase: "estado-cancelado" },
  { clave: "ausentes", nombre: "Ausentes", clase: "estado-ausente" },
] as const;

function TablaEstados({
  conteos,
}: {
  conteos: { total: number; confirmados: number; atendidos: number; cancelados: number; ausentes: number };
}) {
  return (
    <div className="estados-resumen" aria-label="Turnos por estado">
      <strong className="estado-total">{conteos.total} total</strong>
      {estadosTurno.map((estado) => (
        <span key={estado.clave} className={`estado-indicador ${estado.clase}`}>
          {estado.nombre}: {conteos[estado.clave]}
        </span>
      ))}
    </div>
  );
}

function minutos(valor: number | null) {
  if (valor === null) return "—";
  const horas = Math.floor(valor / 60);
  const resto = valor % 60;
  return horas ? `${horas} h ${resto} min` : `${resto} min`;
}

function ocupacion(porcentaje: number | null, estado: string) {
  if (estado === "sin_franjas") return "Sin franjas";
  if (estado === "inactivo") return "Inactivo · no computa";
  return porcentaje === null ? "—" : `${porcentaje.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

export default async function DashboardOperativoPage({ searchParams }: Props) {
  await exigirGerente();
  const params = await searchParams;
  const hoy = hoyArgentina();
  const porDefecto = periodoPorDefecto(hoy);
  const periodo: Periodo = {
    desde: primero(params.desde) ?? porDefecto.desde,
    hasta: primero(params.hasta) ?? porDefecto.hasta,
  };
  const { data, error } = await obtenerDashboardOperativo(periodo);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Dashboard operativo</h2>
          <p className="texto-suave">Ocupación, actividad y pacientes del período.</p>
        </div>
        <Link
          className="boton-secundario boton-inline"
          href={`/indicadores?desde=${periodo.desde}&hasta=${periodo.hasta}`}
        >
          Volver a indicadores
        </Link>
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
        <button className="boton-principal boton-inline" type="submit">Ver dashboard</button>
        <div className="fila-acciones">
          {periodosRapidos(hoy).map((rapido) => (
            <Link key={rapido.texto} className="boton-pill" href={urlPeriodo(rapido.periodo)}>
              {rapido.texto}
            </Link>
          ))}
        </div>
      </form>

      {error && <p className="mensaje-error" role="alert">{error}</p>}

      {data && (
        <>
          <p className="texto-suave">
            Período: {formatearFechaCorta(data.desde)} al {formatearFechaCorta(data.hasta)}
          </p>

          <div className="indicadores-grid bloque">
            <article className="tarjeta indicador indicador-destacado">
              <span className="indicador-titulo">Ocupación del centro</span>
              <strong className="indicador-valor">
                {ocupacion(data.ocupacion_centro.porcentaje, data.ocupacion_centro.estado)}
              </strong>
              <span className="indicador-detalle">
                {minutos(data.ocupacion_centro.minutos_ocupados)} ocupados de {minutos(data.ocupacion_centro.minutos_disponibles)} disponibles
              </span>
            </article>
            <article className="tarjeta indicador">
              <span className="indicador-titulo">Pacientes nuevos</span>
              <strong className="indicador-valor">{data.pacientes_nuevos}</strong>
              <span className="indicador-detalle">Dados de alta durante el período</span>
            </article>
            <article className="tarjeta indicador">
              <span className="indicador-titulo">Pacientes recurrentes</span>
              <strong className="indicador-valor">{data.pacientes_recurrentes}</strong>
              <span className="indicador-detalle">Ya existían y tuvieron turnos en el período</span>
            </article>
          </div>

          <h3>Turnos por profesional</h3>
          {data.profesionales.length === 0 ? (
            <p className="texto-suave">No hubo turnos ni profesionales activos en el período.</p>
          ) : (
            <div className="tabla-scroll bloque">
              <table className="tabla tabla-operativa">
                <thead>
                  <tr>
                    <th>Profesional</th>
                    <th>Estado</th>
                    <th>Turnos</th>
                    <th>Ocupación</th>
                    <th>Minutos ocupados / disponibles</th>
                    <th>Detalle por estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.profesionales.map((profesional) => (
                    <tr key={profesional.id_profesional}>
                      <td>{profesional.apellido}, {profesional.nombre}</td>
                      <td>
                        <span className={profesional.activo ? "badge-activo" : "badge-inactivo"}>
                          {profesional.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td><strong>{profesional.total}</strong></td>
                      <td>{ocupacion(profesional.porcentaje_ocupacion, profesional.estado_ocupacion)}</td>
                      <td>{minutos(profesional.minutos_ocupados)} / {minutos(profesional.minutos_disponibles)}</td>
                      <td><TablaEstados conteos={profesional} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Turnos por servicio</h3>
          {data.servicios.length === 0 ? (
            <p className="texto-suave">No hubo turnos asociados a servicios en el período.</p>
          ) : (
            <div className="tabla-scroll bloque">
              <table className="tabla tabla-operativa">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Estado</th>
                    <th>Turnos</th>
                    <th>Detalle por estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.servicios.map((servicio) => (
                    <tr key={servicio.id_servicio}>
                      <td>{servicio.nombre}</td>
                      <td>
                        <span className={servicio.activo ? "badge-activo" : "badge-inactivo"}>
                          {servicio.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td><strong>{servicio.total}</strong></td>
                      <td><TablaEstados conteos={servicio} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
