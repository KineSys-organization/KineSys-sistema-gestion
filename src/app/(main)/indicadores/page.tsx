import Link from "next/link";
import { exigirGerente } from "@/lib/auth";
import {
  obtenerDashboardOperativo,
  obtenerIndicadores,
  obtenerIndicadoresEconomicos,
} from "@/lib/indicadores/actions";
import { SeccionEconomicos } from "@/components/indicadores/SeccionEconomicos";
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

// Si el parámetro viene repetido en la URL (?desde=a&desde=b), Next manda un array: usamos el primero.
const primero = (valor?: string | string[]) => (Array.isArray(valor) ? valor[0] : valor);

const urlPeriodo = (periodo: Periodo) =>
  `/indicadores?desde=${periodo.desde}&hasta=${periodo.hasta}`;

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

function detalleMinutos(ocupados: number | null, disponibles: number | null, estado: string) {
  if (estado === "sin_franjas") return `${minutos(ocupados)} ocupados · sin franjas disponibles`;
  if (estado === "inactivo") return `${minutos(ocupados)} ocupados · no computa`;
  return `${minutos(ocupados)} ocupados de ${minutos(disponibles)} disponibles`;
}

function ocupacion(porcentaje: number | null, estado: string) {
  if (estado === "sin_franjas") return "Sin franjas";
  if (estado === "inactivo") return "Inactivo · no computa";
  return porcentaje === null ? "—" : `${porcentaje.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

// HU-26 resume turnos y pacientes nuevos; HU-18 completa la misma vista con el dashboard operativo.
// Solo Gerente. El período va en la URL y sin parámetros abre el mes actual.
export default async function IndicadoresPage({ searchParams }: Props) {
  await exigirGerente();
  const params = await searchParams;

  const hoy = hoyArgentina();
  const porDefecto = periodoPorDefecto(hoy);
  const periodo: Periodo = {
    desde: primero(params.desde) ?? porDefecto.desde,
    hasta: primero(params.hasta) ?? porDefecto.hasta,
  };

  const [resumen, dashboard, economicos] = await Promise.all([
    obtenerIndicadores(periodo),
    obtenerDashboardOperativo(periodo),
    obtenerIndicadoresEconomicos(periodo), // HU-19
  ]);
  const { data } = resumen;
  const error = resumen.error ?? dashboard.error;

  const estados = data
    ? [
        { titulo: "Confirmados", valor: data.turnos.confirmados, detalle: "Pendientes de atender" },
        { titulo: "Atendidos", valor: data.turnos.atendidos, detalle: "Atención registrada" },
        { titulo: "Cancelados", valor: data.turnos.cancelados, detalle: "Liberaron el horario" },
        { titulo: "Ausentes", valor: data.turnos.ausentes, detalle: "El paciente no vino" },
      ]
    : [];

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Indicadores</h2>
          <p className="texto-suave">Resumen del consultorio en el período que elijas.</p>
        </div>
        <div className="fila-acciones">
          {/* HU-19: acceso directo a la sección económica. */}
          <a className="boton-secundario boton-inline" href="#economicos">
            Ver económicos ↓
          </a>
          <a className="boton-principal boton-inline" href="#dashboard-operativo">
            Ver dashboard operativo ↓
          </a>
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
            <div className="tarjeta indicador">
              <span className="indicador-titulo">Turnos del período</span>
              <strong className="indicador-valor">{data.turnos.total}</strong>
              <span className="indicador-detalle">Todos los estados</span>
            </div>
            <div className="tarjeta indicador">
              <span className="indicador-titulo">Pacientes nuevos</span>
              <strong className="indicador-valor">{data.pacientes_nuevos}</strong>
              <span className="indicador-detalle">Dados de alta en el período</span>
            </div>
          </div>

          <h3>Turnos por estado</h3>
          <div className="indicadores-grid">
            {estados.map((estado) => (
              <div key={estado.titulo} className="tarjeta indicador">
                <span className="indicador-titulo">{estado.titulo}</span>
                <strong className="indicador-valor">{estado.valor}</strong>
                <span className="indicador-detalle">{estado.detalle}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* HU-19: mismo Desde / Hasta y atajos de arriba. Un error acá no tapa el resto. */}
      {economicos.data ? (
        <SeccionEconomicos datos={economicos.data} />
      ) : (
        economicos.error &&
        !error && (
          <p className="mensaje-error" role="alert">
            Indicadores económicos: {economicos.error}
          </p>
        )
      )}

      {dashboard.data && (
        <section id="dashboard-operativo" className="bloque" aria-labelledby="titulo-dashboard-operativo">
          <div className="modulo-cabecera">
            <div>
              <h3 id="titulo-dashboard-operativo">Dashboard operativo</h3>
              <p className="texto-suave">Ocupación, actividad y pacientes del período.</p>
            </div>
          </div>

          <div className="indicadores-grid bloque">
            <article className="tarjeta indicador">
              <span className="indicador-titulo">Ocupación del centro</span>
              <strong className="indicador-valor">
                {ocupacion(dashboard.data.ocupacion_centro.porcentaje, dashboard.data.ocupacion_centro.estado)}
              </strong>
              <span className="indicador-detalle">
                {detalleMinutos(
                  dashboard.data.ocupacion_centro.minutos_ocupados,
                  dashboard.data.ocupacion_centro.minutos_disponibles,
                  dashboard.data.ocupacion_centro.estado,
                )}
              </span>
            </article>
            <article className="tarjeta indicador">
              <span className="indicador-titulo">Pacientes recurrentes</span>
              <strong className="indicador-valor">{dashboard.data.pacientes_recurrentes}</strong>
              <span className="indicador-detalle">Ya existían y tuvieron turnos en el período</span>
            </article>
          </div>

          <h3>Turnos por profesional</h3>
          {dashboard.data.profesionales.length === 0 ? (
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
                    <th>Detalle por estado</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.data.profesionales.map((profesional) => (
                    <tr key={profesional.id_profesional}>
                      <td>{profesional.apellido}, {profesional.nombre}</td>
                      <td>
                        <span className={profesional.activo ? "badge-activo" : "badge-inactivo"}>
                          {profesional.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td><strong>{profesional.total}</strong></td>
                      <td>
                        <strong>{ocupacion(profesional.porcentaje_ocupacion, profesional.estado_ocupacion)}</strong>
                        <span className="indicador-detalle tabla-detalle">
                          {detalleMinutos(
                            profesional.minutos_ocupados,
                            profesional.minutos_disponibles,
                            profesional.estado_ocupacion,
                          )}
                        </span>
                      </td>
                      <td><TablaEstados conteos={profesional} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Turnos por servicio</h3>
          {dashboard.data.servicios.length === 0 ? (
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
                  {dashboard.data.servicios.map((servicio) => (
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
        </section>
      )}
    </section>
  );
}
