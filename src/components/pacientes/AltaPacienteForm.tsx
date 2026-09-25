"use client";

import { useActionState } from "react";
import { registrarPaciente } from "@/lib/pacientes/actions";
import type { EstadoFormulario, ObraSocial } from "@/lib/pacientes/tipos";
import { ListaObrasSociales } from "@/components/pacientes/ListaObrasSociales";

const vacio: EstadoFormulario = { ok: false, error: null };

export function AltaPacienteForm({
  obras,
  volver = null,
}: {
  obras: ObraSocial[];
  volver?: string | null;
}) {
  const [estado, action, pending] = useActionState(registrarPaciente, vacio);

  return (
    <form className="login-form" action={action}>
      {/* Otorgar turno: a dónde volver después del alta (lo revalida el servidor). */}
      {volver && <input type="hidden" name="volver" value={volver} />}
      <div className="campo">
        <label htmlFor="nombre_paciente">Nombre</label>
        <input id="nombre_paciente" name="nombre_paciente" required />
      </div>
      <div className="campo">
        <label htmlFor="apellido_paciente">Apellido</label>
        <input id="apellido_paciente" name="apellido_paciente" required />
      </div>
      <div className="campo">
        <label htmlFor="dni_paciente">DNI</label>
        <input
          id="dni_paciente"
          name="dni_paciente"
          inputMode="numeric"
          maxLength={8}
          placeholder="45774284"
          required
        />
      </div>
      <div className="campo">
        <label htmlFor="fecha_nacimiento_paciente">Fecha de nacimiento</label>
        <input
          id="fecha_nacimiento_paciente"
          name="fecha_nacimiento_paciente"
          type="date"
          required
        />
      </div>
      <div className="campo">
        <label htmlFor="telefono_paciente">Teléfono</label>
        <input
          id="telefono_paciente"
          name="telefono_paciente"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          placeholder="3874209876"
          required
        />
      </div>
      <div className="campo">
        <label htmlFor="mail_paciente">Email</label>
        <input id="mail_paciente" name="mail_paciente" type="email" required />
      </div>

      <fieldset className="fieldset-obras">
        <legend>Obras sociales</legend>
        <ListaObrasSociales obras={obras} />
      </fieldset>

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}

      <button className="boton-principal" type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Registrar paciente"}
      </button>
    </form>
  );
}
