"use client";

import { useState, useTransition, type FormEvent } from "react";
import { editarFranja, registrarFranja } from "@/lib/profesionales/horarios-actions";
import { DIAS_SEMANA, type EstadoFranja, type FranjaProfesional } from "@/lib/profesionales/horarios";
import { TurnosAfectados } from "./TurnosAfectados";

const vacio: EstadoFranja = { ok: false, error: null };

export function HorariosForm({ id, franja, alTerminar }: {
  id: string;
  franja?: FranjaProfesional | null;
  alTerminar: (resultado?: EstadoFranja) => void;
}) {
  const [estado, setEstado] = useState(vacio);
  const [pending, startTransition] = useTransition();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const datos = new FormData(form);
    if (estado.requiereConfirmacion) datos.set("confirmar", "si");
    startTransition(async () => {
      const resultado = franja
        ? await editarFranja(id, franja.id_franja, vacio, datos)
        : await registrarFranja(id, vacio, datos);
      setEstado(resultado);
      if (resultado.ok) {
        if (!franja) form.reset();
        alTerminar(resultado);
      }
    });
  }

  return (
    <form className="login-form" onSubmit={enviar} onChange={() => setEstado(vacio)}>
      <fieldset className="campos-sin-borde" disabled={pending}>
        <div className="campo">
          <label htmlFor="dia_semana">Día de la semana</label>
          <select id="dia_semana" name="dia_semana" required defaultValue={franja?.dia_semana ?? ""}>
            <option value="" disabled>Seleccioná un día</option>
            {DIAS_SEMANA.map((dia, index) => <option key={dia} value={index + 1}>{dia}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="hora_inicio">Hora de inicio</label>
          <input id="hora_inicio" name="hora_inicio" type="time" step="60" required defaultValue={franja?.hora_inicio.slice(0, 5) ?? ""} />
        </div>
        <div className="campo">
          <label htmlFor="hora_fin">Hora de fin</label>
          <input id="hora_fin" name="hora_fin" type="time" step="60" required defaultValue={franja?.hora_fin.slice(0, 5) ?? ""} />
        </div>
      </fieldset>
      {estado.error && <p className="mensaje-error" role="alert">{estado.error}</p>}
      {estado.requiereConfirmacion && <TurnosAfectados turnos={estado.turnos ?? []} />}
      <div className="fila-acciones">
        <button className="boton-principal" disabled={pending} type="submit">
          {pending ? "Procesando..." : estado.requiereConfirmacion ? "Confirmar y guardar" : franja ? "Revisar cambio" : "Agregar franja"}
        </button>
        {franja && <button className="boton-secundario" type="button" disabled={pending} onClick={() => alTerminar()}>Cancelar</button>}
      </div>
    </form>
  );
}
