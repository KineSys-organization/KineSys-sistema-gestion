"use client";

import { useActionState, useEffect, useState } from "react";
import { cambiarPrioridad } from "@/lib/turnos/actions";
import type { EstadoAccionTurno } from "@/lib/turnos/tipos";
import { LARGO_MAXIMO_NOTA_PRIORIDAD, PRIORIDADES, type Prioridad } from "@/lib/turnos/prioridad";

const inicial: EstadoAccionTurno = { ok: false, error: null };

// HU-20. Cambiar la prioridad de un turno confirmado que todavía no empezó.
// Solo aparece si la base dice prioridad_editable y el rol tiene "turnos.prioridad".
export function PrioridadForm({
  idTurno,
  prioridad,
  nota,
}: {
  idTurno: string;
  prioridad: Prioridad;
  nota: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState<string>(prioridad);
  const [textoNota, setTextoNota] = useState(nota ?? "");
  const [estado, action, pending] = useActionState(cambiarPrioridad, inicial);

  // Guardado: se cierra y la página (revalidada) muestra la marca nueva.
  useEffect(() => {
    if (estado.ok) setAbierto(false);
  }, [estado]);

  if (!abierto) {
    return (
      <button className="boton-pill" type="button" onClick={() => setAbierto(true)}>
        Cambiar prioridad
      </button>
    );
  }

  return (
    <form className="login-form form-prioridad" action={action}>
      <input type="hidden" name="id_turno" value={idTurno} />
      <div className="campo">
        <label htmlFor="prioridad">Prioridad</label>
        <select
          id="prioridad"
          name="prioridad"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        >
          {PRIORIDADES.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.etiqueta}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="nota_prioridad">Nota (opcional)</label>
        <input
          id="nota_prioridad"
          name="nota_prioridad"
          type="text"
          maxLength={LARGO_MAXIMO_NOTA_PRIORIDAD}
          value={textoNota}
          onChange={(e) => setTextoNota(e.target.value)}
          placeholder="Ej.: dolor agudo, viene derivado de guardia"
        />
      </div>

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}

      <div className="fila-acciones">
        <button className="boton-principal boton-inline" type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar prioridad"}
        </button>
        <button
          className="boton-pill"
          type="button"
          disabled={pending}
          onClick={() => {
            setValor(prioridad);
            setTextoNota(nota ?? "");
            setAbierto(false);
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
