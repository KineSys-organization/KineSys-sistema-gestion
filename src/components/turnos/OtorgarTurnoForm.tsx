"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { otorgarTurno } from "@/lib/turnos/actions";
import type { EstadoOtorgar } from "@/lib/turnos/tipos";
import type { ObraSocialPaciente } from "@/lib/pacientes/tipos";
import { urlPasoHorario } from "@/lib/turnos/flujo";
import {
  coberturaInicial,
  MENSAJE_NO_DISPONIBLE,
  PARTICULAR,
} from "@/lib/turnos/validar";

const vacio: EstadoOtorgar = { ok: false, error: null };

export function OtorgarTurnoForm({
  idPaciente,
  obras,
  idProfesional,
  idServicio,
  fecha,
  hora,
}: {
  idPaciente: string;
  obras: ObraSocialPaciente[];
  idProfesional: string;
  idServicio: string;
  fecha: string;
  hora: string;
}) {
  const [estado, action, pending] = useActionState(otorgarTurno, vacio);
  // Una sola obra viene preseleccionada; con varias, Recepción tiene que elegir.
  const [cobertura, setCobertura] = useState(coberturaInicial(obras));

  // Se envía con onSubmit (y no con action={...}) para que React no resetee el
  // formulario si la base rechaza el turno: así la cobertura elegida sigue marcada.
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => action(datos));
  }

  return (
    <form className="login-form" onSubmit={enviar}>
      <input type="hidden" name="id_paciente" value={idPaciente} />
      <input type="hidden" name="id_profesional" value={idProfesional} />
      <input type="hidden" name="id_servicio" value={idServicio} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="hora" value={hora} />

      <fieldset className="fieldset-obras">
        <legend>¿Con qué cobertura se atiende?</legend>
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
      </fieldset>

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
          {estado.error === MENSAJE_NO_DISPONIBLE && (
            <>
              {" "}
              <Link
                href={urlPasoHorario({
                  paciente: idPaciente,
                  profesional: idProfesional,
                  servicio: idServicio,
                  fecha,
                })}
              >
                Elegir otro horario
              </Link>
            </>
          )}
        </p>
      )}

      <button
        className="boton-principal"
        type="submit"
        disabled={pending || !cobertura}
      >
        {pending ? "Confirmando..." : "Confirmar turno"}
      </button>
    </form>
  );
}
