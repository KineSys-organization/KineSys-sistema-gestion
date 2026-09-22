"use client";

import { useActionState, useEffect, useRef } from "react";
import { registrarFranja } from "@/lib/profesionales/horarios-actions";
import { DIAS_SEMANA, type EstadoFranja } from "@/lib/profesionales/horarios";

const vacio: EstadoFranja = { ok: false, error: null };

export function HorariosForm({ id }: { id: string }) {
  const [estado, action, pending] = useActionState(registrarFranja.bind(null, id), vacio);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok) {
      formRef.current?.reset();
    }
  }, [estado]);

  return (
    <form ref={formRef} className="login-form" action={action}>
      <div className="campo">
        <label htmlFor="dia_semana">Día de la semana</label>
        <select id="dia_semana" name="dia_semana" required defaultValue={estado.campos?.dia_semana ?? ""}>
          <option value="" disabled>Seleccioná un día</option>
          {DIAS_SEMANA.map((dia, index) => <option key={dia} value={index + 1}>{dia}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="hora_inicio">Hora de inicio</label>
        <input id="hora_inicio" name="hora_inicio" type="time" step="60" required defaultValue={estado.campos?.hora_inicio ?? ""} />
      </div>
      <div className="campo">
        <label htmlFor="hora_fin">Hora de fin</label>
        <input id="hora_fin" name="hora_fin" type="time" step="60" required defaultValue={estado.campos?.hora_fin ?? ""} />
      </div>
      {estado.error && <p className="mensaje-error" role="alert">{estado.error}</p>}
      {estado.ok && <p className="mensaje-ok" role="status">Franja registrada. Podés agregar otra.</p>}
      <button className="boton-principal" disabled={pending} type="submit">
        {pending ? "Guardando..." : "Agregar franja"}
      </button>
    </form>
  );
}

