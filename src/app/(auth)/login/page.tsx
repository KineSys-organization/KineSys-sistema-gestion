"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Marca } from "@/components/Marca";
import { login, type EstadoLogin } from "./actions";

const estadoInicial: EstadoLogin = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, estadoInicial);
  const [mostrarPassword, setMostrarPassword] = useState(false);

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
            <div className="campo-password">
              <input
                id="password"
                name="password"
                type={mostrarPassword ? "text" : "password"}
                autoComplete="current-password"
              />
              <button
                className="boton-mostrar-password"
                type="button"
                aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={mostrarPassword}
                onClick={() => setMostrarPassword((visible) => !visible)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  {mostrarPassword ? (
                    <>
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9.5 7-.4 1-1.3 2.3-2.5 3.4M6.2 6.2C3.8 7.7 2.7 10 2.5 12c1 2.5 4.5 7 9.5 7 1.1 0 2.1-.2 3-.5" />
                    </>
                  ) : (
                    <>
                      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {state.error && <p className="mensaje-error" role="alert">{state.error}</p>}

          <button className="boton-principal" type="submit" disabled={pending}>
            {pending ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="login-nota">Sistema de gestión — acceso interno</p>
        {/* HU-23: los pacientes sacan turno desde su propio ingreso. */}
        <p className="login-nota">
          <Link href="/portal/ingresar">¿Sos paciente? Sacá tu turno online</Link>
        </p>
      </section>
    </main>
  );
}
