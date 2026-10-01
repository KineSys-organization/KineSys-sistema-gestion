"use client";

import { useState, useTransition } from "react";
import { cambiarEstadoUsuarioGestion } from "@/lib/usuarios-gestion/actions";

export function BotonAlternarUsuarioGestion({
  id,
  activo,
  esUsuarioActual,
  desactivarBloqueado,
}: {
  id: string;
  activo: boolean;
  esUsuarioActual: boolean;
  desactivarBloqueado: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const siguienteActivo = !activo;

  return (
    <span>
      <button
        className={`boton-pill ${activo ? "boton-peligro" : ""}`}
        type="button"
        disabled={isPending || desactivarBloqueado}
        title={desactivarBloqueado ? "Es el único Gerente activo" : undefined}
        onClick={() => {
          if (activo) {
            const aviso = esUsuarioActual
              ? "Te vas a desactivar. Se cierra la sesión. ¿Continuar?"
              : "Esta persona no va a poder entrar hasta que la reactives. La cuenta no se borra. ¿Desactivar?";
            if (!window.confirm(aviso)) return;
          }
          startTransition(async () => {
            const resultado = await cambiarEstadoUsuarioGestion(id, siguienteActivo);
            setError(resultado.error);
          });
        }}
      >
        {isPending ? "..." : activo ? "Desactivar" : "Activar"}
      </button>
      {error && <span className="mensaje-error" role="alert">{error}</span>}
    </span>
  );
}
