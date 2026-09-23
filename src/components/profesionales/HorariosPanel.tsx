"use client";

import { useCallback, useState, useTransition } from "react";
import { eliminarFranja } from "@/lib/profesionales/horarios-actions";
import { DIAS_SEMANA, type EstadoFranja, type FranjaProfesional } from "@/lib/profesionales/horarios";
import { TurnosAfectados } from "./TurnosAfectados";
import { HorariosForm } from "@/components/profesionales/HorariosForm";

export function HorariosPanel({
  id,
  tieneServicios,
  habilitadoTurnos,
  franjas,
}: {
  id: string;
  tieneServicios: boolean;
  habilitadoTurnos: boolean;
  franjas: FranjaProfesional[];
}) {
  const [editando, setEditando] = useState<FranjaProfesional | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EstadoFranja | null>(null);
  const [eliminando, setEliminando] = useState<{ id: string; resultado: EstadoFranja } | null>(null);
  const [isPending, startTransition] = useTransition();

  const terminarEdicion = useCallback((res?: EstadoFranja) => {
    setEditando(null);
    if (res) setResultado(res);
  }, []);

  function alEliminar(idFranja: string, confirmar = false) {
    setMensajeError(null);
    startTransition(async () => {
      const res = await eliminarFranja(id, idFranja, confirmar);
      if (!res.ok && res.error) {
        setMensajeError(res.error);
      } else if (res.requiereConfirmacion) {
        setEliminando({ id: idFranja, resultado: res });
      } else if (res.ok) {
        setEliminando(null);
        setResultado(res);
        if (editando?.id_franja === idFranja) setEditando(null);
      }
    });
  }

  return (
    <>
    {resultado?.ok && <TurnosAfectados turnos={resultado.turnos ?? []} guardado />}
    <div className="modulo-grid">
      <div className="tarjeta">
        <h3>{editando ? "Editar franja" : "Agregar franja"}</h3>
        {tieneServicios ? (
          <HorariosForm
            key={editando?.id_franja ?? "nuevo"}
            id={id}
            franja={editando}
            alTerminar={terminarEdicion}
          />
        ) : (
          <p className="mensaje-error">
            El profesional debe tener al menos un servicio asociado para cargar horarios.
          </p>
        )}
      </div>

      <div className="horarios-lista">
        <h3>Franjas semanales</h3>
        {eliminando && (
          <div className="tarjeta">
            <h4>Eliminar franja</h4>
            <TurnosAfectados turnos={eliminando.resultado.turnos ?? []} />
            <div className="fila-acciones">
              <button className="boton-pill boton-peligro" disabled={isPending} onClick={() => alEliminar(eliminando.id, true)}>Confirmar eliminación</button>
              <button className="boton-pill" disabled={isPending} onClick={() => setEliminando(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {mensajeError && <p className="mensaje-error" role="alert">{mensajeError}</p>}
        {franjas.length === 0 ? (
          <p className="texto-suave">No tiene horarios configurados.</p>
        ) : (
          <table className="tabla">
            <caption className="solo-lectores">Horarios semanales del profesional</caption>
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Inicio</th>
                <th scope="col">Fin</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {franjas.map((franja) => (
                <tr key={franja.id_franja}>
                  <td>{DIAS_SEMANA[franja.dia_semana - 1]}</td>
                  <td>{franja.hora_inicio.slice(0, 5)}</td>
                  <td>{franja.hora_fin.slice(0, 5)}</td>
                  <td>
                    <div className="fila-acciones">
                      <button
                        className="boton-pill"
                        type="button"
                        onClick={() => { setEditando(franja); setEliminando(null); }}
                        disabled={isPending}
                      >
                        Editar
                      </button>
                      <button
                        className="boton-pill boton-peligro"
                        type="button"
                        onClick={() => alEliminar(franja.id_franja)}
                        disabled={isPending}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="aviso-accion">
          {habilitadoTurnos
            ? "El profesional tiene servicios y horarios configurados para recibir turnos."
            : "Para recibir turnos, el profesional debe estar activo y tener al menos un servicio y una franja horaria."}
        </p>
      </div>
    </div>
    </>
  );
}
