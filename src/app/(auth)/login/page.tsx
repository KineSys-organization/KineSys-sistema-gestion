"use client";

import { useActionState } from "react";
import { Marca } from "@/components/Marca";
import { login, type EstadoLogin } from "./actions";

const estadoInicial: EstadoLogin = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, estadoInicial);

  return (
    <main className="login-page">
      <section className="login-card">
        <Marca />

        <form className="login-form" action={formAction} noValidate>
          <div className="campo">
            <label htmlFor="email">Mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
            />
          </div>

          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
            />
          </div>

          {state.error && <p className="mensaje-error">{state.error}</p>}

          <button className="boton-principal" type="submit" disabled={pending}>
            {pending ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="login-nota">Sistema de gestión — acceso interno</p>
      </section>
    </main>
  );
}
