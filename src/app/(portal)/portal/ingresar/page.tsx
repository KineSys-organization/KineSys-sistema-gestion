"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Marca } from "@/components/Marca";
import { ingresarPaciente, type EstadoIngreso } from "./actions";

const estadoInicial: EstadoIngreso = { error: null };

// HU-23. Ingreso del paciente para sacar turnos online (aparte del acceso interno).
export default function IngresarPortalPage() {
  const [state, formAction, pending] = useActionState(ingresarPaciente, estadoInicial);

  return (
    <main className="login-page">
      <section className="login-card">
        <Marca />

        <h2 className="portal-titulo-ingreso">Turnos online</h2>

        <form className="login-form" action={formAction} noValidate>
          <div className="campo">
            <label htmlFor="email">Mail</label>
            <input id="email" name="email" type="email" autoComplete="username" />
          </div>

          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" autoComplete="current-password" />
          </div>

          {state.error && (
            <p className="mensaje-error" role="alert">
              {state.error}
            </p>
          )}

          <button className="boton-principal" type="submit" disabled={pending}>
            {pending ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="login-nota">
          Ingresá con el mail que registraste en el centro. Si no lo tenés cargado, pedíselo a
          Recepción.
        </p>
        <p className="login-nota">
          <Link href="/login">Soy del personal del centro</Link>
        </p>
      </section>
    </main>
  );
}
