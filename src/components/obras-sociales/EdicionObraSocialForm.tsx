"use client";

import { useActionState } from "react";
import { editarObraSocial } from "@/lib/obras-sociales/actions";
import type { EstadoFormularioObraSocial, ObraSocialCatalogo } from "@/lib/obras-sociales/tipos";

const vacio: EstadoFormularioObraSocial = { ok: false, error: null };

export function EdicionObraSocialForm({
  obra,
  onCancelar,
}: {
  obra: ObraSocialCatalogo;
  onCancelar: () => void;
}) {
  const [state, action, pending] = useActionState(editarObraSocial, vacio);

  return (
    <form className="login-form" action={action} key={obra.id_obra_social}>
      <input type="hidden" name="id_obra_social" value={obra.id_obra_social} />
      <div className="campo">
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" name="nombre" defaultValue={obra.nombre_obra_social} maxLength={80} required />
      </div>
      {state.error && <p className="mensaje-error" role="alert">{state.error}</p>}
      {state.ok && <p className="mensaje-ok">Obra social actualizada</p>}
      <div className="fila-acciones">
        <button className="boton-principal" type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar cambios"}
        </button>
        <button className="boton-secundario" type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
