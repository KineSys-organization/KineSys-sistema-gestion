import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { obtenerPagoTurno } from "@/lib/pagos/actions";
import {
  etiquetaMedio,
  formatearMomento,
  formatearPesos,
  MENSAJE_YA_PAGADO,
  precioSugerido,
} from "@/lib/pagos/validar";
import { formatearFecha } from "@/lib/turnos/validar";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import { PagoForm } from "@/components/pagos/PagoForm";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; corregir?: string }>;
};

// HU-14. Pago de un turno: registrar el cobro, consultarlo o corregirlo.
// El pago es posterior a reservar: no cambia el estado del turno.
// Si el turno después se cancela, se marca ausente o se reprograma, el pago se conserva.
export default async function PagoTurnoPage({ params, searchParams }: Props) {
  await exigirRecepcion();
  const { id } = await params;
  const { ok, corregir } = await searchParams;
  const { data, error } = await obtenerPagoTurno(id);

  if (error || !data) {
    return (
      <section className="modulo">
        <h2>Pago del turno</h2>
        <p className="mensaje-error" role="alert">
          {error ?? "El turno no existe"}
        </p>
        <Link href="/pagos">Volver al listado de pagos</Link>
      </section>
    );
  }

  const { turno, pago, correcciones, cobrable } = data;
  const conObraSocial = Boolean(turno.id_obra_social);

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera">
        <div>
          <h2>Pago del turno</h2>
          <p className="texto-suave">
            {pago ? "Pago registrado del turno." : "Registrá el cobro del turno."}
          </p>
        </div>
        <Link className="boton-secundario boton-inline" href={`/turnos/${turno.id_turno}`}>
          Volver al turno
        </Link>
      </div>

      {ok === "registrado" && (
        <p className="mensaje-ok" role="status">
          Pago registrado.
        </p>
      )}
      {ok === "corregido" && (
        <p className="mensaje-ok" role="status">
          Corrección guardada. Quedó registrada en el historial.
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
        </dl>
      </div>

      {pago ? (
        corregir ? (
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
            />
          </div>
        ) : (
          <div className="tarjeta">
            {!ok && (
              <p className="aviso-accion" role="status">
                {MENSAJE_YA_PAGADO}.
              </p>
            )}
            <dl className="resumen-turno">
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
            {(turno.estado === "cancelado" || turno.estado === "ausente") && (
              <p className="texto-suave">
                El turno está {turno.estado}. El pago se conserva: no hay devolución automática.
              </p>
            )}
            <div className="acciones-pie">
              <Link
                className="boton-principal boton-inline"
                href={`/turnos/${turno.id_turno}/pago?corregir=1`}
              >
                Corregir pago
              </Link>
              <Link className="boton-secundario boton-inline" href="/pagos">
                Ver todos los pagos
              </Link>
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
                      {Number(c.descuento_anterior) > 0 &&
                        ` (base ${formatearPesos(c.importe_base_anterior)} − ${formatearPesos(c.descuento_anterior)})`}
                    </td>
                    <td>
                      {formatearPesos(c.importe_final_nuevo)} ·{" "}
                      {etiquetaMedio(c.medio_pago_nuevo)}
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
