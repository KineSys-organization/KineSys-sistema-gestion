"use client";

import { useActionState, useMemo, useState } from "react";
import { consultarDisponibilidad } from "@/lib/disponibilidad/actions";
import type { EstadoConsulta } from "@/lib/disponibilidad/tipos";
import type { Profesional } from "@/lib/profesionales/tipos";
import {
  fechaMaximaConsulta,
  fechaMinimaConsulta,
} from "@/lib/disponibilidad/validar";

const vacio: EstadoConsulta = { ok: false, error: null, data: null };

export function DisponibilidadForm({
  profesionales,
}: {
  profesionales: Profesional[];
}) {
  const [profesionalId, setProfesionalId] = useState(
    profesionales[0]?.id_usuario ?? ""
  );
  const [estado, action, pending] = useActionState(consultarDisponibilidad, vacio);

  const servicios = useMemo(() => {
    const profesional = profesionales.find((p) => p.id_usuario === profesionalId);
    return profesional?.servicios ?? [];
  }, [profesionales, profesionalId]);

  const min = fechaMinimaConsulta();
  const max = fechaMaximaConsulta();

  if (profesionales.length === 0) {
    return (
      <p className="texto-suave">
        No hay profesionales activos con servicios. Configurá profesionales y
        franjas antes de consultar disponibilidad.
      </p>
    );
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
              onChange={(e) => setProfesionalId(e.target.value)}
              required
            >
              {profesionales.map((p) => (
                <option key={p.id_usuario} value={p.id_usuario}>
                  {p.apellido_usuario}, {p.nombre_usuario}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="id_servicio">Servicio</label>
            <select id="id_servicio" name="id_servicio" required key={profesionalId}>
              <option value="">Elegí un servicio</option>
              {servicios.map((s) => (
                <option key={s.id_servicio} value={s.id_servicio}>
                  {s.nombre_servicio}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="fecha">Fecha</label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              min={min}
              max={max}
              required
            />
          </div>

          {estado.error && <p className="mensaje-error">{estado.error}</p>}

          <button className="boton-principal" type="submit" disabled={pending}>
            {pending ? "Consultando..." : "Ver horarios disponibles"}
          </button>
        </form>
      </section>

      <section className="tarjeta">
        <h3>Horarios disponibles</h3>
        {!estado.data ? (
          <p className="texto-suave">Elegí profesional, servicio y fecha.</p>
        ) : (
          <>
            <p className="texto-suave">
              {estado.data.apellido_profesional}, {estado.data.nombre_profesional}
              {" · "}
              {estado.data.nombre_servicio} ({estado.data.duracion_minutos} min)
              {" · "}
              {estado.data.fecha}
            </p>

            {estado.data.mensaje && (
              <p className="mensaje-error">{estado.data.mensaje}</p>
            )}

            {estado.data.horarios.length > 0 && (
              <ul className="lista-horarios">
                {estado.data.horarios.map((hora) => (
                  <li key={hora}>
                    <span className="badge-horario">{hora}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
