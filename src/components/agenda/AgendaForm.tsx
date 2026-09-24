"use client";

import { useActionState, useState } from "react";
import { consultarAgenda } from "@/lib/agenda/actions";
import type { EstadoAgenda } from "@/lib/agenda/tipos";
import type { Profesional } from "@/lib/profesionales/tipos";

const vacio: EstadoAgenda = { ok: false, error: null, data: null };

export function AgendaForm({ profesionales }: { profesionales: Profesional[] }) {
  const [profesionalId, setProfesionalId] = useState(
    profesionales[0]?.id_usuario ?? ""
  );
  const [estado, action, pending] = useActionState(consultarAgenda, vacio);

  if (profesionales.length === 0) {
    return <p className="texto-suave">No hay profesionales activos para consultar.</p>;
  }

  return (
    <div className="modulo-grid">
      <section className="tarjeta">
        <h3>Consulta</h3>
        <form className="login-form" action={action}>
          <div className="campo">
            <label htmlFor="id_profesional">Profesional</label>
            <select
              id="id_profesional"
              name="id_profesional"
              value={profesionalId}
              onChange={(event) => setProfesionalId(event.target.value)}
              required
            >
              {profesionales.map((profesional) => (
                <option key={profesional.id_usuario} value={profesional.id_usuario}>
                  {profesional.apellido_usuario}, {profesional.nombre_usuario}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="fecha">Fecha</label>
            <input id="fecha" name="fecha" type="date" required />
          </div>

          {estado.error && <p className="mensaje-error">{estado.error}</p>}
          <button className="boton-principal" type="submit" disabled={pending}>
            {pending ? "Consultando..." : "Consultar agenda"}
          </button>
        </form>
      </section>

      <section className="tarjeta">
        <h3>Turnos del día</h3>
        {!estado.data ? (
          <p className="texto-suave">Elegí un profesional y una fecha.</p>
        ) : estado.data.turnos.length === 0 ? (
          <p className="texto-suave">No hay turnos para ese profesional en esa fecha.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Horario</th>
                <th>Paciente</th>
                <th>DNI</th>
                <th>Servicio</th>
              </tr>
            </thead>
            <tbody>
              {estado.data.turnos.map((turno) => (
                <tr key={turno.id_turno}>
                  <td>
                    {turno.hora_inicio} a {turno.hora_fin}
                  </td>
                  <td>
                    {turno.apellido_paciente}, {turno.nombre_paciente}
                  </td>
                  <td>{turno.dni_paciente}</td>
                  <td>{turno.nombre_servicio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
