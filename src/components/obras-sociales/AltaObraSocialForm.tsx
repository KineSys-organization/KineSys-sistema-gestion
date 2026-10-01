"use client";

import { useActionState } from "react";
import { registrarObraSocial } from "@/lib/obras-sociales/actions";
import type { EstadoFormularioObraSocial } from "@/lib/obras-sociales/tipos";

const vacio: EstadoFormularioObraSocial = { ok: false, error: null };

export function AltaObraSocialForm() {
  const [state, action, pending] = useActionState(registrarObraSocial, vacio);
  return (
    <form className="login-form" action={action}>
      <div className="campo">
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" name="nombre" maxLength={80} required />
      </div>
      {state.error && <p className="mensaje-error" role="alert">{state.error}</p>}
      <button className="boton-principal" type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Registrar obra social"}
      </button>
    </form>
  );
}
