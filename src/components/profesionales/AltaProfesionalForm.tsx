"use client";

import { useActionState } from "react";
import { crearProfesional } from "@/lib/profesionales/actions";
import type { EstadoFormulario } from "@/lib/profesionales/tipos";
import type { Servicio } from "@/lib/servicios/tipos";
import { ListaServiciosChecks } from "@/components/profesionales/ListaServiciosChecks";

const vacio: EstadoFormulario = { ok: false, error: null };

export function AltaProfesionalForm({ servicios }: { servicios: Servicio[] }) {
  const [state, action, pending] = useActionState(crearProfesional, vacio);
  const activos = servicios.filter((servicio) => servicio.activo);

  return (
    <form className="login-form" action={action} noValidate>
      <div className="campo">
        <label htmlFor="nombre_usuario">Nombre</label>
        <input id="nombre_usuario" name="nombre_usuario" />
      </div>
      <div className="campo">
        <label htmlFor="apellido_usuario">Apellido</label>
        <input id="apellido_usuario" name="apellido_usuario" />
      </div>
      <div className="campo">
        <label htmlFor="email">Mail</label>
        <input id="email" name="email" type="email" autoComplete="off" />
      </div>
      <div className="campo">
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="new-password" />
      </div>
      <div className="campo">
        <label htmlFor="fecha_nacimiento_usuario">Fecha de nacimiento</label>
        <input id="fecha_nacimiento_usuario" name="fecha_nacimiento_usuario" type="date" />
      </div>
      <div className="campo">
        <label htmlFor="dni_usuario">DNI</label>
        <input id="dni_usuario" name="dni_usuario" inputMode="numeric" />
      </div>
      <div className="campo">
        <label htmlFor="telefono_usuario">Teléfono</label>
        <input id="telefono_usuario" name="telefono_usuario" />
      </div>
      <div className="campo">
        <label htmlFor="matricula">Matrícula</label>
        <input id="matricula" name="matricula" />
      </div>

      <fieldset className="campo">
        <legend>Servicios</legend>
        <ListaServiciosChecks servicios={servicios} />
      </fieldset>

      {state.error && <p className="mensaje-error">{state.error}</p>}

      <button className="boton-principal" type="submit" disabled={pending || activos.length === 0}>
        {pending ? "Registrando..." : "Registrar profesional"}
      </button>
    </form>
  );
}
