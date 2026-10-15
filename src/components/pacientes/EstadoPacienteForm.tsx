"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoPaciente } from "@/lib/pacientes/actions";
import type { Paciente } from "@/lib/pacientes/tipos";

function fechaLegible(fecha: string): string {
  return new Date(`${fecha.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "long",
  });
}

export function EstadoPacienteForm({ paciente }: { paciente: Paciente }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nuevoEstado = !paciente.activo;
  const turnosFuturos = paciente.turnos_confirmados_futuros ?? [];

  function confirmar() {
    startTransition(async () => {
      const resultado = await cambiarEstadoPaciente(paciente.id_paciente, nuevoEstado);
      setError(resultado.error);
      if (resultado.ok) {
        setConfirmando(false);
        router.refresh();
      }
    });
  }

  return (
    <section aria-labelledby="estado-paciente-titulo">
      <h3 id="estado-paciente-titulo">Estado del paciente</h3>
      <p>
        <span className={paciente.activo ? "badge-activo" : "badge-inactivo"}>
          {paciente.activo ? "Activo" : "Inactivo"}
        </span>
      </p>

      {!confirmando ? (
        <button
          className={`boton-pill ${paciente.activo ? "boton-peligro" : ""}`}
          type="button"
          onClick={() => {
            setError(null);
            setConfirmando(true);
          }}
        >
          {paciente.activo ? "Desactivar paciente" : "Activar paciente"}
        </button>
      ) : (
        <div className="estado-paciente-confirmacion" role="group" aria-label="Confirmar cambio de estado">
          <p>
            {paciente.activo
              ? "El paciente no recibirá turnos nuevos. Los turnos existentes se conservan y siguen funcionando."
              : "El paciente volverá a estar disponible para otorgar turnos."}
          </p>
          {paciente.activo && turnosFuturos.length > 0 && (
            <div>
              <h4>Turnos confirmados a futuro</h4>
              <p className="texto-suave">Se conservan; no se cancelarán al desactivar.</p>
              <ul>
                {turnosFuturos.map((turno) => (
                  <li key={turno.id_turno}>
                    {fechaLegible(turno.fecha)} · {turno.hora_inicio} · {turno.apellido_profesional}, {turno.nombre_profesional} · {turno.nombre_servicio}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="fila-acciones">
            <button
              className={`boton-principal boton-inline ${paciente.activo ? "boton-peligro" : ""}`}
              type="button"
              disabled={isPending}
              onClick={confirmar}
            >
              {isPending ? "Guardando..." : `Confirmar ${paciente.activo ? "desactivación" : "activación"}`}
            </button>
            <button
              className="boton-secundario boton-inline"
              type="button"
              disabled={isPending}
              onClick={() => setConfirmando(false)}
            >
              Volver
            </button>
          </div>
        </div>
      )}
      {error && <p className="mensaje-error" role="alert">{error}</p>}
    </section>
  );
}
