"use client";

import { useState, useTransition } from "react";
import { cambiarEstadoObraSocial } from "@/lib/obras-sociales/actions";
import type { ObraSocialCatalogo } from "@/lib/obras-sociales/tipos";

export function BotonEstadoObraSocial({
  obra,
  onError,
}: {
  obra: ObraSocialCatalogo;
  onError: (mensaje: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className={`boton-pill ${obra.activo ? "boton-peligro" : ""}`}
      type="button"
      disabled={isPending}
      onClick={() => {
        if (obra.activo) {
          const ok = window.confirm(
            "La obra queda inactiva: no se va a poder asignar a pacientes nuevos ni elegirla al otorgar un turno. Los pacientes y turnos que ya la tienen se conservan. ¿Desactivar?"
          );
          if (!ok) return;
        }
        startTransition(async () => {
          const resultado = await cambiarEstadoObraSocial(obra.id_obra_social, !obra.activo);
          onError(resultado.error);
        });
      }}
    >
      {isPending ? "..." : obra.activo ? "Desactivar" : "Activar"}
    </button>
  );
}
