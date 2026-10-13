import Link from "next/link";
import { consultarDashboard } from "@/lib/dashboard/actions";
import {
  armarMes,
  diaElegido,
  esMesValido,
  colorPorEstado,
  mesDeFecha,
  nombreMes,
  proximidad,
  REFERENCIAS_ESTADO,
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

function IconoProximidad({
  tipo,
  etiqueta,
  decorativo = false,
}: {
  tipo: "hoy" | "pronto" | "semana" | "lejos";
  etiqueta: string;
  decorativo?: boolean;
}) {
  const accesibilidad = decorativo
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": etiqueta, title: etiqueta };

  return (
    <svg
      className={`proximidad-icono proximidad-icono-${tipo}`}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...accesibilidad}
    >
      {tipo === "hoy" && (
        <>
          <path d="M5.2 5.2 3.7 3.7M18.8 5.2l1.5-1.5M8 3h8" />
          <circle cx="12" cy="13" r="8" />
          <path d="M12 8v5l3.2 2M9.2 21h5.6" />
          <circle cx="12" cy="13" r=".75" fill="currentColor" stroke="none" />
        </>
      )}
      {tipo === "pronto" && (
        <>
          <path d="M7 3h10M7 21h10M8 3c0 4.5 4 4.5 4 9s-4 4.5-4 9M16 3c0 4.5-4 4.5-4 9s4 4.5 4 9" />
          <path d="M9.4 6.2h5.2M9.4 17.8h5.2" />
          <path d="M10 8.2 12 10l2-1.8zM10 15.8 12 14l2 1.8z" fill="currentColor" stroke="none" opacity=".28" />
        </>
      )}
      {tipo === "semana" && (
        <>
          <rect x="3" y="4.5" width="18" height="17" rx="3" />
          <path d="M8 2.5v4M16 2.5v4M3 9h18" />
          <rect x="5.5" y="11.5" width="13" height="3.5" rx="1.5" fill="currentColor" stroke="none" opacity=".2" />
          <path d="M7.5 13.2h9M7.5 17.8h.01M11.5 17.8h.01M15.5 17.8h.01" />
        </>
      )}
      {tipo === "lejos" && (
        <>
          <path d="M3 7V5.5A2.5 2.5 0 0 1 5.5 3H16" />
          <path d="M6 7.5h12.5A2.5 2.5 0 0 1 21 10v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7.5Z" />
          <path d="M10 5.5v4M16 5.5v4M6 11h15" />
          <path d="M9.5 14.5h.01M12.5 14.5h.01M9.5 17.5h.01" />
          <path d="M14 17.5h4m-1.7-1.7 1.7 1.7-1.7 1.7" />
        </>
      )}
    </svg>
  );
}

// HU-15/HU-36. Dashboard del Profesional en Inicio. Server Component: el mes y el día elegido
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
                          {celda.turnos.slice(0, TURNOS_POR_CELDA).map((t) => {
                            const cercania = proximidad(t, hoy);
                            return (
                              <span
                                key={t.id_turno}
                                className={`turno-chip turno-color-${colorPorEstado(t.estado)}`}
                                title={`${t.hora_inicio} ${ETIQUETA_ESTADO[t.estado]} · ${t.apellido_paciente}, ${t.nombre_paciente}`}
                              >
                                <span className="turno-chip-texto">
                                  {t.hora_inicio} <span className="turno-chip-estado">{ETIQUETA_ESTADO[t.estado]}</span>
                                </span>
                                {cercania && (
                                  <IconoProximidad
                                    tipo={cercania}
                                    etiqueta={textoProximidad(t.fecha.slice(0, 10), hoy)}
                                  />
                                )}
                              </span>
                            );
                          })}
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

        <div className="referencias-calendario" aria-label="Referencias del calendario">
          <div className="referencia-grupo">
            <strong>Colores = estado</strong>
            <ul className="referencias-proximidad">
              {REFERENCIAS_ESTADO.map((r) => (
                <li key={r.estado}>
                  <span className={`referencia-color turno-color-${colorPorEstado(r.estado)}`} aria-hidden="true" />
                  {r.texto}
                </li>
              ))}
            </ul>
          </div>
          <div className="referencia-grupo">
            <strong>Íconos = proximidad</strong>
            <ul className="referencias-proximidad">
              {REFERENCIAS_PROXIMIDAD.map((r) => (
                <li key={r.proximidad}>
                  <IconoProximidad tipo={r.proximidad} etiqueta={r.texto} decorativo />
                  {r.texto}
                </li>
              ))}
            </ul>
          </div>
        </div>
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
                  {turnosDelDia.map((t) => {
                    const cercania = proximidad(t, hoy);
                    return (
                    <tr key={t.id_turno} className={t.estado === "cancelado" ? "fila-cancelada" : undefined}>
                      <td>
                        <div className="horario-con-proximidad">
                          <span>{t.hora_inicio} a {t.hora_fin}</span>
                          {cercania && (
                            <IconoProximidad
                              tipo={cercania}
                              etiqueta={textoProximidad(t.fecha.slice(0, 10), hoy)}
                            />
                          )}
                        </div>
                        <span className="texto-suave proximidad-texto">
                          {formatearFechaCorta(t.fecha)}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
