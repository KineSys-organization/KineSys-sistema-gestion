"use client";

import { useActionState } from "react";
import { crearUsuarioGestion } from "@/lib/usuarios-gestion/actions";
import { fechaNacimientoMaxima } from "@/lib/profesionales/validar";
import type { EstadoFormularioUsuario } from "@/lib/usuarios-gestion/tipos";

const vacio: EstadoFormularioUsuario = { ok: false, error: null };

export function UsuarioGestionForm() {
  const [state, action, pending] = useActionState(crearUsuarioGestion, vacio);
  return (
    <form className="login-form" action={action} noValidate>
      <div className="campo"><label htmlFor="nombre_usuario">Nombre</label><input id="nombre_usuario" name="nombre_usuario" autoComplete="given-name" /></div>
      <div className="campo"><label htmlFor="apellido_usuario">Apellido</label><input id="apellido_usuario" name="apellido_usuario" autoComplete="family-name" /></div>
      <div className="campo"><label htmlFor="email">Mail</label><input id="email" name="email" type="email" autoComplete="off" /></div>
      <div className="campo"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="new-password" /></div>
      <div className="campo"><label htmlFor="fecha_nacimiento_usuario">Fecha de nacimiento</label><input id="fecha_nacimiento_usuario" name="fecha_nacimiento_usuario" type="date" max={fechaNacimientoMaxima()} /></div>
      <div className="campo"><label htmlFor="dni_usuario">DNI</label><input id="dni_usuario" name="dni_usuario" inputMode="numeric" maxLength={8} placeholder="45774284" /></div>
      <div className="campo"><label htmlFor="telefono_usuario">Teléfono</label><input id="telefono_usuario" name="telefono_usuario" type="tel" inputMode="numeric" maxLength={10} placeholder="3874209876" /></div>
      <div className="campo">
        <label htmlFor="rol_usuario">Rol</label>
        <select id="rol_usuario" name="rol_usuario" defaultValue="">
          <option value="" disabled>Elegí un rol</option>
          <option value="Gerente">Gerente</option>
          <option value="Mesa de Entradas">Mesa de Entradas</option>
        </select>
      </div>
      {state.error && <p className="mensaje-error" role="alert">{state.error}</p>}
      <button className="boton-principal" type="submit" disabled={pending}>{pending ? "Registrando..." : "Registrar usuario"}</button>
    </form>
  );
}
