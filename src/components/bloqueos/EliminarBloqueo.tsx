"use client";

import { useActionState } from "react";
import { eliminarBloqueo } from "@/lib/bloqueos/actions";

export function EliminarBloqueo({ id }: { id: string }) {
  const [estado, action, pending] = useActionState(eliminarBloqueo, { error: null });

  return (
    <form action={action}>
      <input type="hidden" name="id_bloqueo" value={id} />
      <button className="boton-secundario boton-inline boton-peligro" type="submit" disabled={pending}>
        {pending ? "Eliminando..." : "Eliminar"}
      </button>
      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}
    </form>
  );
}
