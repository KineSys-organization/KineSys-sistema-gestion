import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { obtenerPagoTurno } from "@/lib/pagos/actions";
import {
  etiquetaMedio,
  etiquetaMotivoReembolso,
  formatearMomento,
  formatearNumeroComprobante,
  formatearPesos,
  MENSAJE_YA_PAGADO,
  MENSAJE_YA_REEMBOLSADO,
  mostrarBotonReembolso,
  precioSugerido,
  puedeCorregirPago,
  urlComprobante,
} from "@/lib/pagos/validar";
import { formatearFecha } from "@/lib/turnos/validar";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import { EstadoPagoBadge } from "@/components/pagos/EstadoPagoBadge";
import { EstadoCobroBadge } from "@/components/pagos/EstadoCobroBadge";
import { PagoForm } from "@/components/pagos/PagoForm";
import { ReembolsoForm } from "@/components/pagos/ReembolsoForm";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; corregir?: string; volver?: string }>;
};

// HU-14. Pago de un turno: registrar el cobro, consultarlo o corregirlo.
// El pago es posterior a reservar: no cambia el estado del turno.
// Si el turno después se cancela, se marca ausente o se reprograma, el pago se conserva.
// HU-22: desde acá se registra el reembolso total; el pago queda Reembolsado (HU-17).
export default async function PagoTurnoPage({ params, searchParams }: Props) {
  const usuario = await exigirRecepcion();
  const { id } = await params;
  const { ok, corregir, volver } = await searchParams;
  const volverAlTurno = volver === "turno";
  const { data, error } = await obtenerPagoTurno(id);

  if (error || !data) {
    return (
      <section className="modulo">
        <h2>Pago del turno</h2>
        <p className="mensaje-error" role="alert">
          {error ?? "El turno no existe"}
        </p>
        <Link href="/pagos">Volver a pagos</Link>
      </section>
    );
  }

  const { turno, pago, reembolso, correcciones, cobrable, reembolsable } = data;
  const conObraSocial = Boolean(turno.id_obra_social);
  const corregible = puedeCorregirPago(pago);
  const conBotonReembolso = mostrarBotonReembolso(reembolsable, usuario.rol_usuario);
  const textoTurno = `${formatearFecha(turno.fecha)} · ${turno.hora_inicio} a ${turno.hora_fin} · ${turno.nombre_servicio}`;

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera">
        <div>
          <h2>Pago del turno</h2>
          <p className="texto-suave">
            {pago ? "Pago registrado del turno." : "Registrá el cobro del turno."}
          </p>
        </div>
        <Link
          className="boton-secundario boton-inline"
          href={volverAlTurno ? `/turnos/${turno.id_turno}` : "/pagos"}
        >
          {volverAlTurno ? "Volver al turno" : "Volver"}
        </Link>
      </div>

      {ok === "registrado" && (
        <div className="mensaje-ok" role="status">
          <p>
            Pago registrado.
            {pago && ` Comprobante Nº ${formatearNumeroComprobante(pago.numero_comprobante)}.`}
          </p>
          {/* HU-35: el comprobante se ofrece apenas se registra el cobro. */}
          {pago && (
            <div className="fila-acciones">
              <Link className="boton-principal boton-inline" href={urlComprobante(pago.id_pago)}>
                Ver comprobante
              </Link>
              <Link
                className="boton-secundario boton-inline"
                href={urlComprobante(pago.id_pago, true)}
              >
                Descargar PDF
              </Link>
            </div>
          )}
        </div>
      )}
      {ok === "corregido" && (
        <p className="mensaje-ok" role="status">
          Corrección guardada. Quedó registrada en el historial.
        </p>
      )}
      {ok === "reembolsado" && (
        <p className="mensaje-ok" role="status">
          Reembolso registrado. El pago quedó como Reembolsado; el turno conserva su estado.
        </p>
      )}

      <div className="tarjeta">
        <dl className="resumen-turno">
          <dt>Paciente</dt>
          <dd>
            {turno.apellido_paciente}, {turno.nombre_paciente} · DNI {turno.dni_paciente}
          </dd>
          <dt>Servicio</dt>
          <dd>{turno.nombre_servicio}</dd>
          <dt>Turno</dt>
          <dd>
            {formatearFecha(turno.fecha)} · {turno.hora_inicio} a {turno.hora_fin}
          </dd>
          <dt>Cobertura</dt>
          <dd>
            {turno.cobertura}
            {turno.numero_afiliado && ` · nº ${turno.numero_afiliado}`}
          </dd>
          <dt>Estado</dt>
          <dd>
            <EstadoTurnoBadge estado={turno.estado} />
          </dd>
          {/* HU-17: estado de cobro del turno (lo calcula la base). */}
          <dt>Estado de cobro</dt>
          <dd>
            <EstadoCobroBadge estado={turno.estado_cobro} />
          </dd>
        </dl>
      </div>

      {pago ? (
        corregir && corregible ? (
          <div className="tarjeta">
            <h3>Corregir pago</h3>
            <p className="texto-suave">
              Corregir no cobra ni devuelve dinero: solo deja bien registrado lo cobrado.
            </p>
            <PagoForm
              idTurno={turno.id_turno}
              modo="corregir"
              conObraSocial={conObraSocial}
              cobertura={turno.cobertura}
              importeBase={precioSugerido(pago.importe_base)}
              descuento={Number(pago.descuento) > 0 ? precioSugerido(pago.descuento) : ""}
              medio={pago.medio_pago}
              numeroOperacion={pago.numero_operacion}
            />
          </div>
        ) : (
          <div className="tarjeta">
            {!ok && (
              <p className="aviso-accion" role="status">
                {reembolso ? MENSAJE_YA_REEMBOLSADO : MENSAJE_YA_PAGADO}.
              </p>
            )}
            <dl className="resumen-turno">
              <dt>Comprobante</dt>
              <dd>Nº {formatearNumeroComprobante(pago.numero_comprobante)}</dd>
              <dt>Estado del pago</dt>
              <dd>
                <EstadoPagoBadge estado={pago.estado} />
              </dd>
              <dt>Importe base</dt>
              <dd>{formatearPesos(pago.importe_base)}</dd>
              <dt>Descuento</dt>
              <dd>{formatearPesos(pago.descuento)}</dd>
              <dt>Importe cobrado</dt>
              <dd>
                <strong>{formatearPesos(pago.importe_final)}</strong>
              </dd>
              <dt>Medio</dt>
              <dd>{etiquetaMedio(pago.medio_pago)}</dd>
              {/* HU-21: nº de operación de la billetera virtual. */}
              {pago.numero_operacion && (
                <>
                  <dt>Nº de operación</dt>
                  <dd>{pago.numero_operacion}</dd>
                </>
              )}
              <dt>Registrado</dt>
              <dd>
                {formatearMomento(pago.registrado_en)} · {pago.registrado_por}
              </dd>
              {pago.corregido_en && (
                <>
                  <dt>Última corrección</dt>
                  <dd>{formatearMomento(pago.corregido_en)}</dd>
                </>
              )}
            </dl>
            {!reembolso && (turno.estado === "cancelado" || turno.estado === "ausente") && (
              <p className="texto-suave">
                El turno está {turno.estado}. El pago se conserva: no hay devolución automática.
              </p>
            )}
            <div className="acciones-pie">
              {/* HU-35: siempre que hay pago (también corregido o reembolsado). */}
              <Link className="boton-secundario boton-inline" href={urlComprobante(pago.id_pago)}>
                Ver comprobante
              </Link>
              {corregible && (
                <Link
                  className="boton-principal boton-inline"
                  href={`/turnos/${turno.id_turno}/pago?corregir=1`}
                >
                  Corregir pago
                </Link>
              )}
              <Link className="boton-secundario boton-inline" href="/pagos">
                Ver todos los pagos
              </Link>
              {/* HU-22: el formulario se abre debajo, a todo el ancho. */}
              {!reembolso && conBotonReembolso && (
                <ReembolsoForm
                  idTurno={turno.id_turno}
                  importe={Number(pago.importe_final)}
                  medioPago={pago.medio_pago}
                  paciente={`${turno.apellido_paciente}, ${turno.nombre_paciente} · DNI ${turno.dni_paciente}`}
                  turno={textoTurno}
                />
              )}
            </div>
          </div>
        )
      ) : cobrable ? (
        <div className="tarjeta">
          <h3>Registrar pago</h3>
          <PagoForm
            idTurno={turno.id_turno}
            modo="registrar"
            conObraSocial={conObraSocial}
            cobertura={turno.cobertura}
            importeBase={precioSugerido(turno.precio_servicio)}
          />
        </div>
      ) : (
        <p className="aviso-accion" role="status">
          Solo se puede registrar el pago de un turno confirmado o atendido.
        </p>
      )}

      {pago && reembolso && (
        <section className="tarjeta">
          <h3>
            Reembolso <EstadoPagoBadge estado="Reembolsado" />
          </h3>
          <dl className="resumen-turno">
            <dt>Fecha y hora</dt>
            <dd>{formatearMomento(reembolso.registrado_en)}</dd>
            <dt>Motivo</dt>
            <dd>{etiquetaMotivoReembolso(reembolso.motivo)}</dd>
            {reembolso.detalle && (
              <>
                <dt>Detalle</dt>
                <dd>{reembolso.detalle}</dd>
              </>
            )}
            <dt>Importe devuelto</dt>
            <dd>
              <strong>{formatearPesos(reembolso.importe)}</strong>
            </dd>
            <dt>Medio de devolución</dt>
            <dd>{etiquetaMedio(reembolso.medio_devolucion)}</dd>
            <dt>Registrado por</dt>
            <dd>{reembolso.registrado_por}</dd>
          </dl>
        </section>
      )}

      {correcciones.length > 0 && (
        <section className="tarjeta">
          <h3>Historial de correcciones</h3>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Antes</th>
                  <th>Después</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {correcciones.map((c) => (
                  <tr key={c.corregido_en}>
                    <td>{formatearMomento(c.corregido_en)}</td>
                    <td>{c.corregido_por}</td>
                    <td>
                      {formatearPesos(c.importe_final_anterior)} ·{" "}
                      {etiquetaMedio(c.medio_pago_anterior)}
                      {c.numero_operacion_anterior && ` (op. ${c.numero_operacion_anterior})`}
                      {Number(c.descuento_anterior) > 0 &&
                        ` (base ${formatearPesos(c.importe_base_anterior)} − ${formatearPesos(c.descuento_anterior)})`}
                    </td>
                    <td>
                      {formatearPesos(c.importe_final_nuevo)} ·{" "}
                      {etiquetaMedio(c.medio_pago_nuevo)}
                      {c.numero_operacion_nuevo && ` (op. ${c.numero_operacion_nuevo})`}
                      {Number(c.descuento_nuevo) > 0 &&
                        ` (base ${formatearPesos(c.importe_base_nuevo)} − ${formatearPesos(c.descuento_nuevo)})`}
                    </td>
                    <td>{c.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
