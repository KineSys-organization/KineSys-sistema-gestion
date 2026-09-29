"use client";

import { useActionState, useState } from "react";
import { corregirAusencia, marcarAusente } from "@/lib/turnos/actions";
import type { EstadoAccionTurno } from "@/lib/turnos/tipos";

const inicial: EstadoAccionTurno = { ok: false, error: null };

// Textos de cada modo: marcar (Confirmado → Ausente) o corregir (Ausente → Confirmado).
const TEXTOS = {
  marcar: {
    boton: "Marcar ausente",
    titulo: "Marcar ausencia",
    explicacion:
      "El turno queda como Ausente: el paciente no vino. El registro no se borra y el horario sigue ocupado.",
    confirmar: "Confirmar ausencia",
    enviando: "Guardando...",
  },
  corregir: {
    boton: "Corregir ausencia",
    titulo: "Corregir ausencia",
    explicacion:
      "Usalo si la ausencia se marcó por error: el turno vuelve a Confirmado y se conservan todos sus datos.",
    confirmar: "Volver a Confirmado",
    enviando: "Guardando...",
  },
} as const;

// HU-10B. Botón que despliega la confirmación (la ausencia nunca se marca en automático).
// Es cliente solo por el estado abierto/cerrado y el resultado de la action.
export function AusenciaTurnoForm({
  idTurno,
  modo,
}: {
  idTurno: string;
  modo: "marcar" | "corregir";
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, action, pending] = useActionState(
    modo === "marcar" ? marcarAusente : corregirAusencia,
    inicial
  );
  const textos = TEXTOS[modo];

  if (!abierto) {
    return (
      <button
        className="boton-secundario boton-inline"
        type="button"
        onClick={() => setAbierto(true)}
      >
        {textos.boton}
      </button>
    );
  }

  return (
    <form className="tarjeta login-form form-cancelar" action={action}>
      <h3>{textos.titulo}</h3>
      <p className="texto-suave">{textos.explicacion}</p>
      <input type="hidden" name="id_turno" value={idTurno} />

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}

      <div className="fila-acciones">
        <button className="boton-principal boton-inline" type="submit" disabled={pending}>
          {pending ? textos.enviando : textos.confirmar}
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
