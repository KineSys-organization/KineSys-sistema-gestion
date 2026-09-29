"use client";

import Link from "next/link";
import { useActionState } from "react";
import { reprogramarTurno } from "@/lib/turnos/actions";
import type { EstadoAccionTurno } from "@/lib/turnos/tipos";

const inicial: EstadoAccionTurno = { ok: false, error: null };

// HU-10C. Confirmación del nuevo horario. Si sale bien, la action redirige al detalle
// del turno; si el horario se ocupó mientras tanto, se muestra el error de la base.
// Es cliente solo por useActionState (resultado y "Guardando...").
export function ConfirmarReprogramacionForm({
  idTurno,
  fecha,
  hora,
  urlOtroHorario,
}: {
  idTurno: string;
  fecha: string;
  hora: string;
  urlOtroHorario: string;
}) {
  const [estado, action, pending] = useActionState(reprogramarTurno, inicial);

  return (
    <form action={action}>
      <input type="hidden" name="id_turno" value={idTurno} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="hora" value={hora} />

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}

      <div className="acciones-pie">
        <button className="boton-principal boton-inline" type="submit" disabled={pending}>
          {pending ? "Reprogramando..." : "Confirmar nuevo horario"}
        </button>
        <Link className="boton-secundario boton-inline" href={urlOtroHorario}>
          Elegir otro horario
        </Link>
        {/* Salir sin confirmar: el turno queda como estaba. */}
        <Link className="boton-secundario boton-inline accion-riesgo" href={`/turnos/${idTurno}`}>
          Volver sin cambios
        </Link>
      </div>
    </form>
  );
}
