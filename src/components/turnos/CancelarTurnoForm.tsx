"use client";

import { useActionState, useState } from "react";
import { cancelarTurno } from "@/lib/turnos/actions";
import type { EstadoCancelar } from "@/lib/turnos/tipos";
import { LARGO_MAXIMO_DETALLE, MOTIVOS_CANCELACION } from "@/lib/turnos/validar";

const inicial: EstadoCancelar = { ok: false, error: null };

// HU-10A. Botón "Cancelar turno" que despliega el formulario con el motivo.
// Es cliente solo por el estado (abierto/cerrado y el resultado de la action).
// Va dentro de la fila de acciones del resumen: cerrado es un botón de riesgo del
// mismo alto que el resto; abierto ocupa todo el ancho debajo.
export function CancelarTurnoForm({ idTurno }: { idTurno: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, action, pending] = useActionState(cancelarTurno, inicial);

  if (!abierto) {
    return (
      <button
        className="boton-secundario boton-inline boton-peligro accion-riesgo"
        type="button"
        onClick={() => setAbierto(true)}
      >
        Cancelar turno
      </button>
    );
  }

  return (
    <form className="tarjeta login-form form-cancelar" action={action}>
      <h3>Cancelar turno</h3>
      <p className="texto-suave">
        El turno queda como cancelado y el horario vuelve a estar libre.
      </p>
      <input type="hidden" name="id_turno" value={idTurno} />

      <div className="campo">
        <label htmlFor="motivo">Motivo</label>
        <select id="motivo" name="motivo" defaultValue="" required>
          <option value="" disabled>
            Elegí un motivo
          </option>
          {MOTIVOS_CANCELACION.map((motivo) => (
            <option key={motivo.valor} value={motivo.valor}>
              {motivo.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="detalle">Detalle (opcional)</label>
        <textarea
          id="detalle"
          name="detalle"
          rows={3}
          maxLength={LARGO_MAXIMO_DETALLE}
          placeholder="Ej.: avisó por teléfono que no puede venir"
        />
      </div>

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}

      <div className="fila-acciones">
        <button
          className="boton-secundario boton-inline boton-peligro"
          type="submit"
          disabled={pending}
        >
          {pending ? "Cancelando..." : "Confirmar cancelación"}
        </button>
        <button
          className="boton-secundario boton-inline"
          type="button"
          disabled={pending}
          onClick={() => setAbierto(false)}
        >
          Volver
        </button>
      </div>
    </form>
  );
}
