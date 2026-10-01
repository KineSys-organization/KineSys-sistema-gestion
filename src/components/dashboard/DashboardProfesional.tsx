import Link from "next/link";
import { consultarDashboard } from "@/lib/dashboard/actions";
import {
  armarMes,
  diaElegido,
  esMesValido,
  mesDeFecha,
  nombreMes,
  proximidad,
  REFERENCIAS_PROXIMIDAD,
  sumarMeses,
  textoProximidad,
  urlDashboard,
} from "@/lib/dashboard/calendario";
import { esFechaValida } from "@/lib/atencion/validar";
import { formatearFechaCorta } from "@/lib/indicadores/validar";
import { formatearFecha } from "@/lib/turnos/validar";
import { DIAS_SEMANA } from "@/lib/disponibilidad/calendario";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import type { EstadoTurno } from "@/lib/turnos/tipos";

const ETIQUETA_ESTADO: Record<EstadoTurno, string> = {
  confirmado: "Confirmado",
  atendido: "Atendido",
  cancelado: "Cancelado",
  ausente: "Ausente",
};

// En cada día del calendario se ven hasta 3 turnos; el resto, en la lista del día.
const TURNOS_POR_CELDA = 3;

// HU-15. Dashboard del Profesional en Inicio. Server Component: el mes y el día elegido
// van en la URL (?mes=2026-09&dia=2026-09-29), así recargar o volver mantiene la vista.
export async function DashboardProfesional({
  hoy,
  mesPedido,
  diaPedido,
}: {
  hoy: string;
  mesPedido: string;
  diaPedido: string;
}) {
  const mes = esMesValido(mesPedido) ? mesPedido : mesDeFecha(hoy);
  const { data, error } = await consultarDashboard(mes);

  if (error || !data) {
    return (
      <p className="mensaje-error" role="alert">
        {error ?? "No se pudo cargar tu resumen"}
      </p>
    );
  }

  const turnos = data.mes.turnos;
  const semanas = armarMes(mes, turnos);
  const elegido = diaElegido(mes, esFechaValida(diaPedido) ? diaPedido : "", hoy, turnos);
  const turnosDelDia = elegido ? turnos.filter((t) => t.fecha.slice(0, 10) === elegido) : [];

  return (
    <>
      <div className="indicadores-grid dashboard-contadores">
        <div className="tarjeta indicador indicador-destacado">
          <span className="indicador-titulo">Turnos de hoy</span>
          <strong className="indicador-valor">{data.dia.total}</strong>
          <span className="indicador-detalle">Sin contar los cancelados</span>
        </div>
        <div className="tarjeta indicador">
          <span className="indicador-titulo">Atendidos hoy</span>
          <strong className="indicador-valor">{data.dia.atendidos}</strong>
        </div>
        <div className="tarjeta indicador">
          <span className="indicador-titulo">Pendientes hoy</span>
          <strong className="indicador-valor">{data.dia.pendientes}</strong>
          <span className="indicador-detalle">Confirmados sin atender</span>
        </div>
        <div className="tarjeta indicador">
          <span className="indicador-titulo">Cancelaciones de la semana</span>
          <strong className="indicador-valor">{data.semana.cancelaciones}</strong>
          <span className="indicador-detalle">
            {formatearFechaCorta(data.semana.desde)} al {formatearFechaCorta(data.semana.hasta)}
          </span>
        </div>
        <div className="tarjeta indicador">
          <span className="indicador-titulo">Ausencias de la semana</span>
          <strong className="indicador-valor">{data.semana.ausencias}</strong>
          <span className="indicador-detalle">
            {formatearFechaCorta(data.semana.desde)} al {formatearFechaCorta(data.semana.hasta)}
          </span>
        </div>
      </div>

      <section className="tarjeta bloque" id="calendario">
        <div className="modulo-cabecera">
          <h3 className="mes-titulo">Mis turnos de {nombreMes(mes)}</h3>
          <div className="fila-acciones">
            <Link className="boton-pill" href={`${urlDashboard(sumarMeses(mes, -1))}#calendario`}>
              ← Mes anterior
            </Link>
            {mes !== mesDeFecha(hoy) && (
              <Link className="boton-pill" href="/#calendario">
                Mes actual
              </Link>
            )}
            <Link className="boton-pill" href={`${urlDashboard(sumarMeses(mes, 1))}#calendario`}>
              Mes siguiente →
            </Link>
          </div>
        </div>

        {turnos.length === 0 && (
          <p className="texto-suave">No tenés turnos en {nombreMes(mes)}.</p>
        )}

        <div className="tabla-scroll">
          <table className="calendario calendario-mes">
            <thead>
              <tr>
                {DIAS_SEMANA.map((dia) => (
                  <th key={dia} scope="col">
                    {dia}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((semana, i) => (
                <tr key={i}>
                  {semana.map((celda, j) => (
                    <td key={j}>
                      {celda && (
                        <Link
                          className={[
                            "dia-mes",
                            celda.turnos.length > 0 ? "dia-mes-con-turnos" : "",
                            celda.fecha === elegido ? "dia-mes-elegido" : "",
                            celda.fecha === hoy ? "dia-mes-hoy" : "",
                          ].join(" ")}
                          href={`${urlDashboard(mes, celda.fecha)}#dia`}
                          aria-current={celda.fecha === elegido ? "date" : undefined}
                          aria-label={`${formatearFecha(celda.fecha)}: ${
                            celda.turnos.length === 0
                              ? "sin turnos"
                              : `${celda.turnos.length} ${celda.turnos.length === 1 ? "turno" : "turnos"}`
                          }`}
                          scroll={false}
                        >
                          <span className="dia-numero">{celda.dia}</span>
                          {celda.turnos.slice(0, TURNOS_POR_CELDA).map((t) => (
                            <span
                              key={t.id_turno}
                              className={`turno-chip prox-${proximidad(t, hoy)}`}
                              title={`${t.hora_inicio} ${ETIQUETA_ESTADO[t.estado]} · ${t.apellido_paciente}, ${t.nombre_paciente}`}
                            >
                              {t.hora_inicio}{" "}
                              <span className="turno-chip-estado">{ETIQUETA_ESTADO[t.estado]}</span>
                            </span>
                          ))}
                          {celda.turnos.length > TURNOS_POR_CELDA && (
                            <span className="turno-chip-mas">
                              +{celda.turnos.length - TURNOS_POR_CELDA} más
                            </span>
                          )}
                        </Link>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="referencias-proximidad" aria-label="Referencias de colores">
          {REFERENCIAS_PROXIMIDAD.map((r) => (
            <li key={r.proximidad}>
              <span className={`referencia-color prox-${r.proximidad}`} aria-hidden="true" />
              {r.texto}
            </li>
          ))}
        </ul>
      </section>

      {elegido && (
        <section className="tarjeta" id="dia">
          <div className="modulo-cabecera">
            <h3>
              {formatearFecha(elegido)}
              {elegido === hoy && <span className="badge-hoy">Hoy</span>}
            </h3>
            {turnosDelDia.length > 0 && (
              <p className="texto-suave">
                {turnosDelDia.length} {turnosDelDia.length === 1 ? "turno" : "turnos"}
              </p>
            )}
          </div>

          {turnosDelDia.length === 0 ? (
            <p className="texto-suave">No tenés turnos este día.</p>
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Horario</th>
                    <th>Paciente</th>
                    <th>Servicio</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {turnosDelDia.map((t) => (
                    <tr key={t.id_turno} className={t.estado === "cancelado" ? "fila-cancelada" : undefined}>
                      <td>
                        <span className={`referencia-color prox-${proximidad(t, hoy)}`} aria-hidden="true" />
                        {t.hora_inicio} a {t.hora_fin}
                        <span className="texto-suave proximidad-texto">
                          {formatearFechaCorta(t.fecha)} · {textoProximidad(t.fecha.slice(0, 10), hoy)}
                        </span>
                      </td>
                      <td>
                        {t.apellido_paciente}, {t.nombre_paciente}
                      </td>
                      <td>{t.nombre_servicio}</td>
                      <td>
                        <EstadoTurnoBadge estado={t.estado} />
                      </td>
                      <td>
                        <Link className="boton-pill" href={`/mi-agenda/${t.id_turno}`}>
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
      )}
    </>
  );
}
