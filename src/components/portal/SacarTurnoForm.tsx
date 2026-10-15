"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { sacarTurno } from "@/lib/portal/actions";
import type { EstadoAccionPortal, ObraSocialPortal } from "@/lib/portal/tipos";
import {
  coberturaInicial,
  MENSAJE_NO_DISPONIBLE,
  PARTICULAR,
  urlPortalNuevo,
} from "@/lib/portal/validar";

const vacio: EstadoAccionPortal = { ok: false, error: null };

// HU-23. Paso 4: cobertura + confirmar. La base revalida el horario al confirmar.
export function SacarTurnoForm({
  obras,
  idServicio,
  idProfesional,
  fecha,
  hora,
}: {
  obras: ObraSocialPortal[];
  idServicio: string;
  idProfesional: string;
  fecha: string;
  hora: string;
}) {
  const [estado, action, pending] = useActionState(sacarTurno, vacio);
  const [cobertura, setCobertura] = useState(coberturaInicial(obras));

  // onSubmit (y no action={...}) para que React no borre la cobertura si la base rechaza.
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => action(datos));
  }

  return (
    <form className="login-form" onSubmit={enviar}>
      <input type="hidden" name="id_servicio" value={idServicio} />
      <input type="hidden" name="id_profesional" value={idProfesional} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="hora" value={hora} />

      <fieldset className="fieldset-obras">
        <legend>¿Con qué cobertura te atendés?</legend>
        <div className="lista-checks">
          {obras.map((obra) => (
            <label key={obra.id_obra_social} className="check-item">
              <input
                type="radio"
                name="cobertura"
                value={obra.id_obra_social}
                checked={cobertura === obra.id_obra_social}
                onChange={() => setCobertura(obra.id_obra_social)}
              />
              <span>
                {obra.nombre_obra_social} · nº {obra.numero_afiliado}
              </span>
            </label>
          ))}
          <label className="check-item">
            <input
              type="radio"
              name="cobertura"
              value={PARTICULAR}
              checked={cobertura === PARTICULAR}
              onChange={() => setCobertura(PARTICULAR)}
            />
            <span>Particular</span>
          </label>
        </div>
        <p className="texto-suave">
          Si tu obra social no aparece o cambió, avisale a Recepción para que la actualice.
        </p>
      </fieldset>

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
          {estado.error === MENSAJE_NO_DISPONIBLE && (
            <>
              {" "}
              <Link href={urlPortalNuevo({ servicio: idServicio, profesional: idProfesional, fecha })}>
                Elegir otro horario
              </Link>
            </>
          )}
        </p>
      )}

      <button className="boton-principal" type="submit" disabled={pending || !cobertura}>
        {pending ? "Confirmando..." : "Confirmar turno"}
      </button>
    </form>
  );
}
