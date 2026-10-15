"use client";

import { useActionState, useState } from "react";
import { editarAtencion, registrarAtencion } from "@/lib/atencion/actions";
import type { EstadoAtencion } from "@/lib/atencion/tipos";
import {
  LARGO_MAXIMO_MOTIVO_CONSULTA,
  LARGO_MAXIMO_OBSERVACIONES,
  LARGO_MAXIMO_ORDEN_MEDICA,
  SESIONES_MAXIMAS,
  SESIONES_MINIMAS,
} from "@/lib/atencion/validar";
import type { ReactNode } from "react";

const inicial: EstadoAtencion = { ok: false, error: null };

type Props = {
  idTurno: string;
  // "registrar": turno confirmado del día. "editar": atención ya registrada (acción explícita).
  modo: "registrar" | "editar";
  observaciones?: string;
  motivo?: string | null;
  ordenMedica?: string | null; // HU-24A (desde HU-38: el detalle)
  ordenSesiones?: number | null; // HU-38
  // HU-38: datos automáticos de la orden (paciente, cobertura, profesional...), de solo lectura.
  datosOrden?: ReactNode;
};

// HU-13. Formulario de la atención. Es cliente por useActionState y porque
// la edición se abre a propósito con un botón (no se confunde con el registro).
export function AtencionForm({
  idTurno,
  modo,
  observaciones = "",
  motivo = "",
  ordenMedica = "",
  ordenSesiones = null,
  datosOrden,
}: Props) {
  const esEdicion = modo === "editar";
  // HU-38: orden de HU-24A (detalle sin sesiones). Si no se toca, se guarda igual.
  const ordenVieja = esEdicion && ordenMedica && ordenSesiones == null ? ordenMedica : null;
  const [textoSesiones, setTextoSesiones] = useState(
    ordenSesiones == null ? "" : String(ordenSesiones)
  );
  const [abierto, setAbierto] = useState(!esEdicion);
  // Controlados: React 19 resetea el form después de la action y, si la base
  // devuelve un error, no queremos perder lo que el profesional escribió.
  const [textoObservaciones, setTextoObservaciones] = useState(observaciones);
  const [textoMotivo, setTextoMotivo] = useState(motivo ?? "");
  const [textoOrden, setTextoOrden] = useState(ordenMedica ?? "");
  const [estado, action, pending] = useActionState(
    esEdicion ? editarAtencion : registrarAtencion,
    inicial
  );

  if (!abierto) {
    return (
      <button className="boton-pill" type="button" onClick={() => setAbierto(true)}>
        Editar atención
      </button>
    );
  }

  return (
    <form className="tarjeta login-form form-atencion" action={action}>
      <h3>{esEdicion ? "Editar atención" : "Registrar atención"}</h3>
      <p className="texto-suave">
        {esEdicion
          ? "Corregí las observaciones, el motivo o la orden médica (sesiones y detalle; vaciá los dos para quitarla). La fecha, el profesional y el paciente no cambian."
          : "Al confirmar, el turno pasa a Atendido con la fecha de hoy y tu nombre como profesional."}
      </p>
      <input type="hidden" name="id_turno" value={idTurno} />

      <div className="campo">
        <label htmlFor="motivo_consulta">Motivo o tipo de consulta (opcional)</label>
        <input
          id="motivo_consulta"
          name="motivo_consulta"
          type="text"
          maxLength={LARGO_MAXIMO_MOTIVO_CONSULTA}
          value={textoMotivo}
          onChange={(event) => setTextoMotivo(event.target.value)}
          placeholder="Ej.: control, primera consulta, sesión de rehabilitación"
        />
      </div>

      <div className="campo">
        <label htmlFor="observaciones">Observaciones</label>
        <textarea
          id="observaciones"
          name="observaciones"
          rows={6}
          maxLength={LARGO_MAXIMO_OBSERVACIONES}
          value={textoObservaciones}
          onChange={(event) => setTextoObservaciones(event.target.value)}
          placeholder="Qué se trabajó en la sesión, evolución, indicaciones..."
          required
        />
      </div>

      {/* HU-24A / HU-38: la orden médica es un bloque aparte. Los datos del paciente salen
          solos; el profesional completa solo las sesiones y el detalle. */}
      <fieldset className="campo-orden-medica">
        <legend>Orden médica (opcional)</legend>
        {datosOrden}
        <p className="texto-suave">
          Si cargás una orden, completá la cantidad de sesiones y el detalle. Dejá los dos vacíos
          para atender sin orden.
        </p>
        <div className="campo">
          <label htmlFor="orden_sesiones">Cantidad de sesiones</label>
          <input
            id="orden_sesiones"
            name="orden_sesiones"
            type="number"
            inputMode="numeric"
            min={SESIONES_MINIMAS}
            max={SESIONES_MAXIMAS}
            step={1}
            value={textoSesiones}
            onChange={(event) => setTextoSesiones(event.target.value)}
            placeholder={ordenVieja ? "No informadas" : "Ej.: 10"}
          />
        </div>
        <div className="campo">
          <label htmlFor="orden_medica">Detalle de la orden</label>
          <textarea
            id="orden_medica"
            name="orden_medica"
            rows={4}
            maxLength={LARGO_MAXIMO_ORDEN_MEDICA}
            value={textoOrden}
            onChange={(event) => setTextoOrden(event.target.value)}
            placeholder="Diagnóstico, indicaciones y tratamiento. Ej.: Lesión de rodilla. Magnetoterapia y electroterapia"
            aria-describedby="orden_medica_contador"
          />
          <span id="orden_medica_contador" className="contador-caracteres">
            {textoOrden.length} / {LARGO_MAXIMO_ORDEN_MEDICA}
          </span>
        </div>
        {ordenVieja && <input type="hidden" name="orden_vieja" value={ordenVieja} />}
      </fieldset>

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}

      <div className="fila-acciones">
        <button className="boton-principal boton-inline" type="submit" disabled={pending}>
          {pending
            ? "Guardando..."
            : esEdicion
              ? "Guardar cambios"
              : "Confirmar atención"}
        </button>
        {esEdicion && (
          <button
            className="boton-pill"
            type="button"
            disabled={pending}
            onClick={() => {
              // Descarta los cambios no guardados.
              setTextoObservaciones(observaciones);
              setTextoMotivo(motivo ?? "");
              setTextoOrden(ordenMedica ?? "");
              setTextoSesiones(ordenSesiones == null ? "" : String(ordenSesiones));
              setAbierto(false);
            }}
          >
            Cancelar edición
          </button>
        )}
      </div>
    </form>
  );
}
