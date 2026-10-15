"use client";

import { useActionState, useState } from "react";
import { cancelarTurnoPortal } from "@/lib/portal/actions";
import type { EstadoAccionPortal } from "@/lib/portal/tipos";

const vacio: EstadoAccionPortal = { ok: false, error: null };

// HU-23. Cancelar un turno propio desde el portal: pide confirmación antes de enviar.
export function CancelarTurnoPortalForm({ idTurno }: { idTurno: string }) {
  const [estado, action, pending] = useActionState(cancelarTurnoPortal, vacio);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button type="button" className="boton-secundario boton-inline" onClick={() => setConfirmando(true)}>
        Cancelar turno
      </button>
    );
  }

  return (
    <form action={action} className="form-cancelar-portal">
      <input type="hidden" name="id_turno" value={idTurno} />
      <p>¿Seguro que querés cancelar este turno?</p>
      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}
      <div className="acciones-fila">
        <button type="submit" className="boton-secundario boton-inline boton-peligro" disabled={pending}>
          {pending ? "Cancelando..." : "Sí, cancelar"}
        </button>
        <button
          type="button"
          className="boton-secundario boton-inline"
          onClick={() => setConfirmando(false)}
          disabled={pending}
        >
          No
        </button>
      </div>
    </form>
  );
}
