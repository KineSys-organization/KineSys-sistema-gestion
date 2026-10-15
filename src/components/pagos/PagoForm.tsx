"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { corregirPago, registrarPago } from "@/lib/pagos/actions";
import type { EstadoPago } from "@/lib/pagos/tipos";
import {
  aCentavos,
  formatearPesos,
  LARGO_MAXIMO_MOTIVO,
  LARGO_MAXIMO_NUMERO_OPERACION,
  MEDIOS_PAGO,
  pideNumeroOperacion,
} from "@/lib/pagos/validar";

const vacio: EstadoPago = { ok: false, error: null };

// HU-14. Registrar el cobro de un turno o corregir el pago existente.
// Muestra el importe final en vivo (base - descuento) antes de guardar.
// El descuento solo aparece si el turno tiene cobertura de obra social.
export function PagoForm({
  idTurno,
  modo,
  conObraSocial,
  cobertura,
  importeBase,
  descuento = "",
  medio = "",
  numeroOperacion = null,
}: {
  idTurno: string;
  modo: "registrar" | "corregir";
  conObraSocial: boolean;
  cobertura: string;
  importeBase: string; // precargado: precio actual del servicio o el importe ya cobrado
  descuento?: string;
  medio?: string;
  numeroOperacion?: string | null; // HU-21: el actual, al corregir
}) {
  const esCorreccion = modo === "corregir";
  const [estado, action, pending] = useActionState(
    esCorreccion ? corregirPago : registrarPago,
    vacio
  );
  const [base, setBase] = useState(importeBase);
  const [desc, setDesc] = useState(descuento);
  // HU-21: el nº de operación aparece solo si el medio es Billetera virtual.
  const [medioElegido, setMedioElegido] = useState(medio);
  const [operacion, setOperacion] = useState(numeroOperacion ?? "");

  // Vista previa del final. Si algún importe no es válido todavía, no se muestra número.
  const baseCent = aCentavos(base);
  const descCent = desc.trim() ? aCentavos(desc) : 0;
  const finalCent = baseCent !== null && descCent !== null ? baseCent - descCent : null;

  // Se envía con onSubmit (no con action={...}) para que React no borre los campos
  // si la base rechaza el pago. El botón queda deshabilitado mientras se guarda.
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => action(datos));
  }

  return (
    <form className="login-form" onSubmit={enviar}>
      <input type="hidden" name="id_turno" value={idTurno} />
      <input type="hidden" name="con_obra_social" value={conObraSocial ? "si" : "no"} />

      <div className="campo">
        <label htmlFor="importe_base">Importe base ($)</label>
        <input
          id="importe_base"
          name="importe_base"
          inputMode="decimal"
          autoComplete="off"
          placeholder="15000 o 15000,50"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          required
        />
        {!esCorreccion && (
          <p className="texto-suave">
            {importeBase
              ? "Precio actual del servicio. Podés modificarlo."
              : "El servicio no tiene precio cargado: ingresá el importe."}
          </p>
        )}
      </div>

      {conObraSocial ? (
        <div className="campo">
          <label htmlFor="descuento">Descuento por obra social ($)</label>
          <input
            id="descuento"
            name="descuento"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <p className="texto-suave">Cobertura del turno: {cobertura}. Ingresalo a mano.</p>
        </div>
      ) : (
        <input type="hidden" name="descuento" value="0" />
      )}

      <p className="importe-final" aria-live="polite">
        Importe final:{" "}
        <strong>
          {finalCent !== null && finalCent > 0 ? formatearPesos(finalCent / 100) : "—"}
        </strong>
      </p>

      <div className="campo">
        <label htmlFor="medio_pago">Medio de pago</label>
        <select
          id="medio_pago"
          name="medio_pago"
          value={medioElegido}
          onChange={(e) => setMedioElegido(e.target.value)}
          required
        >
          <option value="" disabled>
            Elegí un medio
          </option>
          {MEDIOS_PAGO.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {/* HU-21: solo con billetera virtual. Recepción lo copia de la app de la billetera
          después de comprobar el cobro (KineSys no se conecta con ninguna billetera). */}
      {pideNumeroOperacion(medioElegido) && (
        <div className="campo">
          <label htmlFor="numero_operacion">Nº de operación</label>
          <input
            id="numero_operacion"
            name="numero_operacion"
            autoComplete="off"
            maxLength={LARGO_MAXIMO_NUMERO_OPERACION}
            pattern="[A-Za-z0-9]{4,50}"
            title="Entre 4 y 50 letras y/o números, sin espacios"
            placeholder="Ej.: 1234567890"
            value={operacion}
            onChange={(e) => setOperacion(e.target.value)}
            required
          />
          <p className="texto-suave">
            Entre 4 y 50 letras y/o números, sin espacios. Comprobá el cobro en la app de la
            billetera antes de registrarlo.
          </p>
        </div>
      )}

      {esCorreccion && (
        <div className="campo">
          <label htmlFor="motivo">Motivo de la corrección</label>
          <textarea
            id="motivo"
            name="motivo"
            rows={3}
            maxLength={LARGO_MAXIMO_MOTIVO}
            placeholder="Ej.: se cobró con tarjeta de crédito, no en efectivo"
            required
          />
        </div>
      )}

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}

      <div className="acciones-pie">
        <button className="boton-principal boton-inline" type="submit" disabled={pending}>
          {pending
            ? "Guardando..."
            : esCorreccion
              ? "Guardar corrección"
              : "Registrar pago"}
        </button>
        <Link
          className="boton-secundario boton-inline"
          href={esCorreccion ? `/turnos/${idTurno}/pago` : `/turnos/${idTurno}`}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
