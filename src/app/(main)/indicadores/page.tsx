import Link from "next/link";
import { exigirGerente } from "@/lib/auth";
import { obtenerIndicadores } from "@/lib/indicadores/actions";
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

// HU-26. Indicadores generales del centro para un período (solo Gerente).
// Vista corta del Incremento 2: turnos por estado y pacientes nuevos.
// El período va en la URL: se puede recargar o compartir. Sin parámetros abre el mes actual.
export default async function IndicadoresPage({ searchParams }: Props) {
  await exigirGerente();
  const params = await searchParams;

  const hoy = hoyArgentina();
  const porDefecto = periodoPorDefecto(hoy);
  const periodo: Periodo = {
    desde: primero(params.desde) ?? porDefecto.desde,
    hasta: primero(params.hasta) ?? porDefecto.hasta,
  };

  const { data, error } = await obtenerIndicadores(periodo);

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
            <div className="tarjeta indicador indicador-destacado">
              <span className="indicador-titulo">Turnos del período</span>
              <strong className="indicador-valor">{data.turnos.total}</strong>
              <span className="indicador-detalle">Todos los estados</span>
            </div>
            <div className="tarjeta indicador indicador-destacado">
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
    </section>
  );
}
