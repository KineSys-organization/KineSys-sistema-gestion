import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { listarPagos } from "@/lib/pagos/actions";
import {
  etiquetaMedio,
  etiquetaMotivoReembolso,
  formatearMomento,
  formatearNumeroComprobante,
  formatearPesos,
  leerFiltrosPagos,
  MEDIOS_PAGO,
  MENSAJE_SIN_PAGOS,
  OPCIONES_FILTRO_REEMBOLSO,
  totalPaginasPagos,
  urlComprobante,
  urlPagos,
  type ParamsPagos,
} from "@/lib/pagos/validar";
import { formatearFecha } from "@/lib/turnos/validar";
import { URL_PENDIENTES_COBRO } from "@/lib/turnos/busqueda";
import { RangoFechas } from "@/components/turnos/RangoFechas";
import { EstadoPagoBadge } from "@/components/pagos/EstadoPagoBadge";

type Props = {
  searchParams: Promise<ParamsPagos>;
};

// "2026-09-29" -> "29/09/2026" (la tabla es angosta; el día completo va en el title).
function fechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

// HU-14. Listado de pagos con filtros: paciente y período de la FECHA DEL PAGO.
// Del más nuevo al más viejo, de a 10. Los filtros viven en la URL (paginar o volver
// desde el detalle conserva la búsqueda). Filtrar vuelve a la página 1.
// HU-22: estado del pago (Pagado / Reembolsado) y filtro Con / Sin reembolso.
export default async function PagosPage({ searchParams }: Props) {
  await exigirRecepcion();
  const filtros = leerFiltrosPagos(await searchParams);
  const { data, error } = await listarPagos(filtros);

  const pagos = data?.pagos ?? [];
  const total = data?.total ?? 0;
  const paginas = totalPaginasPagos(total);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Pagos</h2>
          <p className="texto-suave">
            Cobros registrados. El cobro se registra desde el detalle de cada turno.
          </p>
        </div>
        {/* HU-17: turnos confirmados o atendidos que todavía no se cobraron. */}
        <Link className="boton-principal boton-inline" href={URL_PENDIENTES_COBRO}>
          Ver pendientes de cobro
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
        {/* HU-35: búsqueda por nº de comprobante ("123" o "0000123"). */}
        <div className="campo">
          <label htmlFor="numero">Nº de comprobante</label>
          <input
            id="numero"
            name="numero"
            inputMode="numeric"
            pattern="\d{1,12}"
            maxLength={12}
            defaultValue={filtros.numero ? formatearNumeroComprobante(filtros.numero) : ""}
            placeholder="0000123"
            title="Solo números"
          />
        </div>
        {/* Período de la fecha del pago (no la del turno). */}
        <RangoFechas desde={filtros.desde ?? ""} hasta={filtros.hasta ?? ""} />
        <div className="campo">
          <label htmlFor="reembolso">Reembolso</label>
          <select id="reembolso" name="reembolso" defaultValue={filtros.reembolso ?? ""}>
            {OPCIONES_FILTRO_REEMBOLSO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>
        {/* HU-21: filtrar por medio (p. ej. Billetera virtual). */}
        <div className="campo">
          <label htmlFor="medio">Medio</label>
          <select id="medio" name="medio" defaultValue={filtros.medio ?? ""}>
            <option value="">Todos</option>
            {MEDIOS_PAGO.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="fila-acciones">
          <button className="boton-principal boton-inline" type="submit">
            Filtrar
          </button>
          <Link className="boton-secundario boton-inline" href="/pagos">
            Limpiar filtros
          </Link>
        </div>
      </form>

      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}

      {!error && (
        <p className="texto-suave" role="status">
          {total === 0
            ? MENSAJE_SIN_PAGOS
            : `${total} ${total === 1 ? "pago" : "pagos"}` +
              (paginas > 1 ? ` · página ${filtros.pagina} de ${paginas}` : "")}
        </p>
      )}

      {pagos.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Paciente</th>
                <th>Fecha del turno</th>
                <th>Servicio</th>
                <th>Importe cobrado</th>
                <th>Fecha del pago</th>
                <th>Medio</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((pago) => (
                <tr key={pago.id_pago}>
                  <td>{formatearNumeroComprobante(pago.numero_comprobante)}</td>
                  <td>
                    {pago.apellido_paciente}, {pago.nombre_paciente}
                    <span className="texto-suave"> · DNI {pago.dni_paciente}</span>
                  </td>
                  <td title={formatearFecha(pago.fecha_turno)}>
                    {fechaCorta(pago.fecha_turno)} {pago.hora_turno}
                  </td>
                  <td>{pago.nombre_servicio}</td>
                  <td>
                    {formatearPesos(pago.importe_final)}
                    {pago.corregido && <span className="texto-suave"> (corregido)</span>}
                  </td>
                  <td>{formatearMomento(pago.registrado_en)}</td>
                  <td>
                    {etiquetaMedio(pago.medio_pago)}
                    {pago.numero_operacion && (
                      <span className="texto-suave"> · op. {pago.numero_operacion}</span>
                    )}
                  </td>
                  <td>
                    <EstadoPagoBadge estado={pago.estado_pago} />
                    {pago.reembolso && (
                      <span className="texto-suave">
                        <br />
                        {formatearMomento(pago.reembolso.registrado_en)}
                        <br />
                        {etiquetaMotivoReembolso(pago.reembolso.motivo)} ·{" "}
                        {formatearPesos(pago.reembolso.importe)}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="fila-acciones">
                      <Link className="boton-pill" href={`/turnos/${pago.id_turno}/pago`}>
                        Ver detalle
                      </Link>
                      {/* HU-35: el mismo comprobante, listo para reimprimir. */}
                      <Link className="boton-pill" href={urlComprobante(pago.id_pago)}>
                        Ver comprobante
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <nav className="paginacion" aria-label="Páginas de pagos">
          {filtros.pagina > 1 ? (
            <Link className="boton-pill" href={urlPagos(filtros, filtros.pagina - 1)}>
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
            <Link className="boton-pill" href={urlPagos(filtros, filtros.pagina + 1)}>
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
