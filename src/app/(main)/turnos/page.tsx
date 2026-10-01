import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { hoyArgentina } from "@/lib/atencion/validar";
import { buscarTurnos, listarOpcionesFiltroTurnos } from "@/lib/turnos/actions";
import {
  ESTADOS_FILTRO,
  leerFiltrosTurnos,
  MENSAJE_SIN_RESULTADOS,
  totalPaginas,
  URL_TURNOS_SIN_FILTROS,
  urlTurnos,
  type ParamsTurnos,
} from "@/lib/turnos/busqueda";
import { urlPasoPaciente } from "@/lib/turnos/flujo";
import { formatearFecha } from "@/lib/turnos/validar";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import { RangoFechas } from "@/components/turnos/RangoFechas";

type Props = {
  searchParams: Promise<ParamsTurnos>;
};

// "2026-09-29" -> "29/09/2026" (la tabla es angosta; el día completo va en el title).
function fechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

// HU-09. Listado transversal de turnos (todos los profesionales) con filtros.
// Arranca en el día de hoy; los filtros y la página viven en la URL, así que paginar,
// volver desde el detalle o recargar conserva la búsqueda. Filtrar vuelve a la página 1.
export default async function TurnosPage({ searchParams }: Props) {
  await exigirRecepcion();
  const params = await searchParams;
  const filtros = leerFiltrosTurnos(params, hoyArgentina());

  const [{ data, error }, opciones] = await Promise.all([
    buscarTurnos(filtros),
    listarOpcionesFiltroTurnos(),
  ]);

  const turnos = data?.turnos ?? [];
  const total = data?.total ?? 0;
  const paginas = totalPaginas(total);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Turnos</h2>
          <p className="texto-suave">
            Buscá un turno por paciente, profesional, servicio, fechas o estado.
          </p>
        </div>
        <Link className="boton-principal boton-inline" href={urlPasoPaciente()}>
          Otorgar turno
        </Link>
      </div>

      {/* GET: los filtros quedan en la URL. Sin "pagina" → siempre vuelve a la 1. */}
      <form className="tarjeta bloque filtros-turnos" method="get" role="search">
        <div className="campo campo-ancho">
          <label htmlFor="q">Paciente</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filtros.texto}
            maxLength={100}
            placeholder="DNI o nombre y apellido"
          />
        </div>
        <div className="campo">
          <label htmlFor="profesional">Profesional</label>
          <select id="profesional" name="profesional" defaultValue={filtros.profesional ?? ""}>
            <option value="">Todos</option>
            {opciones.profesionales.map((p) => (
              <option key={p.id_usuario} value={p.id_usuario}>
                {p.apellido_usuario}, {p.nombre_usuario}
                {!p.activo && " (inactivo)"}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="servicio">Servicio</label>
          <select id="servicio" name="servicio" defaultValue={filtros.servicio ?? ""}>
            <option value="">Todos</option>
            {opciones.servicios.map((s) => (
              <option key={s.id_servicio} value={s.id_servicio}>
                {s.nombre_servicio}
                {!s.activo && " (inactivo)"}
              </option>
            ))}
          </select>
        </div>
        <RangoFechas desde={filtros.desde ?? ""} hasta={filtros.hasta ?? ""} />
        <div className="campo">
          <label htmlFor="estado">Estado</label>
          <select id="estado" name="estado" defaultValue={filtros.estado ?? ""}>
            <option value="">Todos</option>
            {ESTADOS_FILTRO.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="fila-acciones">
          <button className="boton-principal boton-inline" type="submit">
            Filtrar
          </button>
          <Link className="boton-secundario boton-inline" href={URL_TURNOS_SIN_FILTROS}>
            Limpiar filtros
          </Link>
        </div>
      </form>

      {(error || opciones.error) && (
        <p className="mensaje-error" role="alert">
          {error ?? opciones.error}
        </p>
      )}

      {!error && (
        <p className="texto-suave" role="status">
          {total === 0
            ? MENSAJE_SIN_RESULTADOS
            : `${total} ${total === 1 ? "turno" : "turnos"}` +
              (paginas > 1 ? ` · página ${filtros.pagina} de ${paginas}` : "")}
        </p>
      )}

      {turnos.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Horario</th>
                <th>Paciente</th>
                <th>DNI</th>
                <th>Profesional</th>
                <th>Servicio</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((turno) => (
                <tr
                  key={turno.id_turno}
                  className={turno.estado === "cancelado" ? "fila-cancelada" : undefined}
                >
                  <td title={formatearFecha(turno.fecha)}>{fechaCorta(turno.fecha)}</td>
                  <td>
                    {turno.hora_inicio} a {turno.hora_fin}
                  </td>
                  <td>
                    {turno.apellido_paciente}, {turno.nombre_paciente}
                  </td>
                  <td>{turno.dni_paciente}</td>
                  <td>
                    {turno.apellido_profesional}, {turno.nombre_profesional}
                  </td>
                  <td>{turno.nombre_servicio}</td>
                  <td>
                    <EstadoTurnoBadge
                      estado={turno.estado}
                      motivoCancelacion={turno.motivo_cancelacion}
                    />
                  </td>
                  <td>
                    <Link className="boton-pill" href={`/turnos/${turno.id_turno}?desde=turnos`}>
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <nav className="paginacion" aria-label="Páginas de turnos">
          {filtros.pagina > 1 ? (
            <Link className="boton-pill" href={urlTurnos(filtros, filtros.pagina - 1)}>
              ← Anterior
            </Link>
          ) : (
            <span className="boton-pill paginacion-inactiva" aria-disabled="true">
              ← Anterior
            </span>
          )}
          <span className="texto-suave">
            Página {Math.min(filtros.pagina, paginas)} de {paginas}
          </span>
          {filtros.pagina < paginas ? (
            <Link className="boton-pill" href={urlTurnos(filtros, filtros.pagina + 1)}>
              Siguiente →
            </Link>
          ) : (
            <span className="boton-pill paginacion-inactiva" aria-disabled="true">
              Siguiente →
            </span>
          )}
        </nav>
      )}
    </section>
  );
}
