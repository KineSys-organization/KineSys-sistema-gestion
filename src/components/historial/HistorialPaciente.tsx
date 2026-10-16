import Link from "next/link";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import { EstadoCobroBadge } from "@/components/pagos/EstadoCobroBadge";
import { RangoFechas } from "@/components/turnos/RangoFechas";
import type { HistorialPaciente as Datos, FiltrosHistorial } from "@/lib/historial/tipos";
import {
  cantidadConTexto,
  MENSAJE_SIN_RESULTADOS,
  MENSAJE_SIN_TURNOS,
  totalPaginas,
  urlHistorial,
} from "@/lib/historial/validar";
import { etiquetaMotivo, formatearFecha } from "@/lib/turnos/validar";
import type { EstadoTurno } from "@/lib/turnos/tipos";
import { etiquetaMedio, formatearPesos } from "@/lib/pagos/validar";

type Props = {
  base: string;
  filtros: FiltrosHistorial;
  historial: Datos | null;
  error: string | null;
  verCobro: boolean;
  verAtencion: boolean;
  verOrdenes: boolean;
  idUsuarioActual?: string | null;
  titulo?: string;
  // true en /pacientes/[id]: params hdesde/hhasta/hprofesional/hpagina (no chocan con órdenes).
  prefijados?: boolean;
  // Campos ocultos a conservar al filtrar (p. ej. turno= en historia clínica).
  ocultos?: Record<string, string>;
};

function fechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

// HU-16. Historial / evolución del paciente: resumen, filtros y listado paginado.
export function HistorialPaciente({
  base,
  filtros,
  historial,
  error,
  verCobro,
  verAtencion,
  verOrdenes,
  idUsuarioActual = null,
  titulo = "Historial",
  prefijados = false,
  ocultos = {},
}: Props) {
  const turnos = historial?.turnos ?? [];
  const resumen = historial?.resumen;
  const total = historial?.total ?? 0;
  const paginas = totalPaginas(total);
  const pathBase = base.split("?")[0].split("#")[0];
  const ancla = "#historial";
  const limpiarParams = new URLSearchParams(ocultos);
  const urlLimpiar = `${pathBase}${limpiarParams.toString() ? `?${limpiarParams}` : ""}${ancla}`;
  const nameProf = prefijados ? "hprofesional" : "profesional";
  const sinTurnosNunca =
    !error &&
    historial &&
    historial.profesionales.length === 0 &&
    !filtros.desde &&
    !filtros.hasta &&
    !filtros.profesional;

  function urlPagina(pagina: number): string {
    const url = urlHistorial(pathBase, filtros, { pagina, prefijados, ancla });
    if (Object.keys(ocultos).length === 0) return url;
    const [sinHash, hash] = url.split("#");
    const u = new URL(sinHash, "http://x");
    for (const [k, v] of Object.entries(ocultos)) u.searchParams.set(k, v);
    return `${u.pathname}${u.search}${hash ? `#${hash}` : ""}`;
  }

  return (
    <div className="historial-paciente" id="historial">
      <h3>{titulo}</h3>
      <p className="texto-suave">
        {verAtencion
          ? "Turnos del paciente con todos los profesionales. En los atendidos se ve la atención registrada."
          : "Todos los turnos del paciente, del más reciente al más antiguo. Solo lectura."}
      </p>

      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}

      {/* Con un error (p. ej. rango inválido) no se muestra el resumen: no respetaría los filtros. */}
      {!error && resumen && (
        <div className="historial-resumen" role="status">
          <span>
            <strong>{resumen.total}</strong> {cantidadConTexto(resumen.total, "turno", "turnos")}
          </span>
          <span>
            <strong>{resumen.atendidos}</strong> {cantidadConTexto(resumen.atendidos, "atendido", "atendidos")}
          </span>
          <span>
            <strong>{resumen.ausentes}</strong> {cantidadConTexto(resumen.ausentes, "ausente", "ausentes")}
          </span>
          <span>
            <strong>{resumen.cancelados}</strong> {cantidadConTexto(resumen.cancelados, "cancelado", "cancelados")}
          </span>
        </div>
      )}

      <form className="filtros-turnos" action={pathBase} method="get" role="search">
        {Object.entries(ocultos).map(([nombre, valor]) => (
          <input key={nombre} type="hidden" name={nombre} value={valor} />
        ))}
        <RangoFechas
          desde={filtros.desde ?? ""}
          hasta={filtros.hasta ?? ""}
          prefijo={prefijados ? "h" : ""}
        />
        <div className="campo">
          <label htmlFor={nameProf}>Profesional</label>
          <select id={nameProf} name={nameProf} defaultValue={filtros.profesional ?? ""}>
            <option value="">Todos</option>
            {(historial?.profesionales ?? []).map((p) => (
              <option key={p.id_profesional} value={p.id_profesional}>
                {p.apellido}, {p.nombre}
                {!p.activo && " (inactivo)"}
              </option>
            ))}
          </select>
        </div>
        <div className="fila-acciones">
          <button className="boton-principal boton-inline" type="submit">
            Filtrar
          </button>
          <Link className="boton-secundario boton-inline" href={urlLimpiar}>
            Limpiar filtros
          </Link>
        </div>
      </form>

      {error ? null : sinTurnosNunca ? (
        <p className="texto-suave">{MENSAJE_SIN_TURNOS}</p>
      ) : turnos.length === 0 ? (
        <p className="texto-suave">{MENSAJE_SIN_RESULTADOS}</p>
      ) : (
        <>
          <ol className="lista-evolucion">
            {turnos.map((t) => {
              const fecha = String(t.fecha).slice(0, 10);
              const propio = Boolean(idUsuarioActual && t.id_profesional === idUsuarioActual);
              const href = verAtencion
                ? propio
                  ? `/mi-agenda/${t.id_turno}`
                  : null
                : `/turnos/${t.id_turno}`;

              return (
                <li key={t.id_turno} className="item-evolucion">
                  <p className="evolucion-cabecera">
                    <strong title={formatearFecha(fecha)}>
                      {fechaCorta(fecha)} · {t.hora_inicio} a {t.hora_fin}
                    </strong>
                    {/* Sin motivoCancelacion: el motivo (con su detalle) va abajo en "Motivo de cancelación". */}
                    <EstadoTurnoBadge estado={t.estado as EstadoTurno} />
                    {verCobro && <EstadoCobroBadge estado={t.estado_cobro} />}
                  </p>
                  <dl className="resumen-turno">
                    <dt>Profesional</dt>
                    <dd>
                      {t.apellido_profesional}, {t.nombre_profesional}
                    </dd>
                    <dt>Servicio</dt>
                    <dd>{t.nombre_servicio}</dd>
                    <dt>Cobertura</dt>
                    <dd>{t.cobertura}</dd>
                    {t.estado === "cancelado" && t.motivo_cancelacion && (
                      <>
                        <dt>Motivo de cancelación</dt>
                        <dd>
                          {etiquetaMotivo(t.motivo_cancelacion)}
                          {t.detalle_cancelacion ? ` · ${t.detalle_cancelacion}` : ""}
                        </dd>
                      </>
                    )}
                    {verCobro && t.importe_final != null && (
                      <>
                        <dt>Pago</dt>
                        <dd>
                          {formatearPesos(t.importe_final)} · {etiquetaMedio(t.medio_pago)}
                          {t.estado_cobro === "reembolsado" && " · Reembolsado"}
                        </dd>
                      </>
                    )}
                    {verOrdenes && t.tiene_orden_medica && (
                      <>
                        <dt>Orden médica</dt>
                        <dd>
                          <Link href={`/pacientes/${historial?.paciente.id_paciente}#ordenes`}>
                            Ver en historial de órdenes
                          </Link>
                        </dd>
                      </>
                    )}
                    {verAtencion && t.atencion && (
                      <>
                        <dt>Motivo de consulta</dt>
                        <dd>{t.atencion.motivo_consulta ?? "—"}</dd>
                        <dt>Observaciones</dt>
                        <dd className="texto-observaciones">{t.atencion.observaciones}</dd>
                        {t.atencion.orden_medica && (
                          <>
                            <dt>Orden médica</dt>
                            <dd className="texto-observaciones">{t.atencion.orden_medica}</dd>
                          </>
                        )}
                      </>
                    )}
                  </dl>
                  {href && (
                    <p>
                      <Link href={href}>Ver turno</Link>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          {paginas > 1 && (
            <nav className="paginacion" aria-label="Páginas del historial">
              {filtros.pagina > 1 ? (
                <Link href={urlPagina(filtros.pagina - 1)}>Anterior</Link>
              ) : (
                <span className="paginacion-inactiva">Anterior</span>
              )}
              <span>
                Página {filtros.pagina} de {paginas}
              </span>
              {filtros.pagina < paginas ? (
                <Link href={urlPagina(filtros.pagina + 1)}>Siguiente</Link>
              ) : (
                <span className="paginacion-inactiva">Siguiente</span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
