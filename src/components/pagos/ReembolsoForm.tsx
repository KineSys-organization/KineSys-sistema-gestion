"use client";

import { startTransition, useActionState, useState } from "react";
import { registrarReembolso } from "@/lib/pagos/actions";
import type { EstadoPago } from "@/lib/pagos/tipos";
import {
  AVISO_REEMBOLSO,
  etiquetaMedio,
  etiquetaMotivoReembolso,
  formatearPesos,
  LARGO_MAXIMO_DETALLE_REEMBOLSO,
  MEDIOS_PAGO,
  MOTIVOS_REEMBOLSO,
  validarReembolso,
} from "@/lib/pagos/validar";

const vacio: EstadoPago = { ok: false, error: null };

// HU-22. Reembolso total del pago en dos pasos:
// 1) motivo, detalle y medio (el importe es el final del pago, no se edita)
// 2) resumen + confirmación, porque no se deshace.
// Es cliente por el estado (abierto, paso y campos controlados).
export function ReembolsoForm({
  idTurno,
  importe,
  medioPago,
  paciente,
  turno,
}: {
  idTurno: string;
  importe: number;
  medioPago: string;
  paciente: string; // "Apellido, Nombre · DNI ..."
  turno: string; // "martes 20 de octubre de 2026 · 09:00 a 09:30 · Servicio"
}) {
  const [estado, action, pending] = useActionState(registrarReembolso, vacio);
  const [abierto, setAbierto] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [medio, setMedio] = useState(medioPago);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  if (!abierto) {
    return (
      <button
        className="boton-secundario boton-inline boton-peligro"
        type="button"
        onClick={() => setAbierto(true)}
      >
        Registrar reembolso
      </button>
    );
  }

  // Paso 1 → 2: se valida acá antes de mostrar el resumen; la base vuelve a validar al confirmar.
  function revisar() {
    const error = validarReembolso({ motivo, detalle, medio });
    setErrorLocal(error);
    if (!error) setRevisando(true);
  }

  function confirmar() {
    const datos = new FormData();
    datos.set("id_turno", idTurno);
    datos.set("motivo", motivo);
    datos.set("detalle", detalle);
    datos.set("medio_devolucion", medio);
    startTransition(() => action(datos));
  }

  const error = errorLocal ?? estado.error;

  return (
    // Va dentro de "acciones-pie" del pago: abierto ocupa todo el ancho debajo (como cancelar turno).
    <div className="tarjeta form-cancelar">
      <h3>Registrar reembolso</h3>
      <p className="aviso-accion">{AVISO_REEMBOLSO}</p>

      {revisando ? (
        // ---------- Paso 2: resumen y confirmación ----------
        <>
          <dl className="resumen-turno">
            <dt>Paciente</dt>
            <dd>{paciente}</dd>
            <dt>Turno</dt>
            <dd>{turno}</dd>
            <dt>Importe a devolver</dt>
            <dd>
              <strong>{formatearPesos(importe)}</strong>
            </dd>
            <dt>Medio de devolución</dt>
            <dd>{etiquetaMedio(medio)}</dd>
            <dt>Motivo</dt>
            <dd>
              {etiquetaMotivoReembolso(motivo)}
              {detalle.trim() && ` · ${detalle.trim()}`}
            </dd>
          </dl>
          <p className="mensaje-error" role="alert">
            Esta acción no se deshace: el pago queda como Reembolsado y ya no se puede corregir.
          </p>
          {estado.error && (
            <p className="mensaje-error" role="alert">
              {estado.error}
            </p>
          )}
          <div className="acciones-pie">
            <button
              className="boton-principal boton-peligro boton-inline"
              type="button"
              disabled={pending}
              onClick={confirmar}
            >
              {pending ? "Registrando..." : "Confirmar reembolso"}
            </button>
            <button
              className="boton-secundario boton-inline"
              type="button"
              disabled={pending}
              onClick={() => setRevisando(false)}
            >
              Volver a editar
            </button>
          </div>
        </>
      ) : (
        // ---------- Paso 1: datos del reembolso ----------
        <div className="login-form">
          <p className="importe-final">
            Importe a devolver: <strong>{formatearPesos(importe)}</strong>
            <span className="texto-suave"> (importe final del pago, reembolso total)</span>
          </p>

          <div className="campo">
            <label htmlFor="motivo_reembolso">Motivo</label>
            <select
              id="motivo_reembolso"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
            >
              <option value="" disabled>
                Elegí un motivo
              </option>
              {MOTIVOS_REEMBOLSO.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="detalle_reembolso">
              Detalle {motivo === "otro" ? "(obligatorio con motivo Otro)" : "(opcional)"}
            </label>
            <textarea
              id="detalle_reembolso"
              rows={3}
              maxLength={LARGO_MAXIMO_DETALLE_REEMBOLSO}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              aria-describedby="detalle_reembolso_contador"
            />
            <span id="detalle_reembolso_contador" className="contador-caracteres">
              {detalle.length} / {LARGO_MAXIMO_DETALLE_REEMBOLSO}
            </span>
          </div>

          <div className="campo">
            <label htmlFor="medio_devolucion">Medio de devolución</label>
            <select id="medio_devolucion" value={medio} onChange={(e) => setMedio(e.target.value)}>
              {MEDIOS_PAGO.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
            <p className="texto-suave">Por defecto, el mismo medio con que se cobró.</p>
          </div>

          {error && (
            <p className="mensaje-error" role="alert">
              {error}
            </p>
          )}

          <div className="acciones-pie">
            <button className="boton-principal boton-inline" type="button" onClick={revisar}>
              Revisar reembolso
            </button>
            <button
              className="boton-secundario boton-inline"
              type="button"
              onClick={() => {
                setAbierto(false);
                setErrorLocal(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
