"use client";

import { useState, useTransition } from "react";
import { alternarProfesional } from "@/lib/profesionales/actions";

export function BotonAlternarProfesional({
  id,
  activo,
}: {
  id: string;
  activo: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span>
    <button
      className={`boton-pill ${activo ? "boton-peligro" : ""}`}
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const resultado = await alternarProfesional(id);
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
