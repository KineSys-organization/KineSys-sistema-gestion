"use client";

import { useActionState } from "react";
import { editarUsuarioGestion } from "@/lib/usuarios-gestion/actions";
import type { EstadoFormularioUsuario, UsuarioGestionEdicion } from "@/lib/usuarios-gestion/tipos";

const vacio: EstadoFormularioUsuario = { ok: false, error: null };

export function EdicionUsuarioGestionForm({ usuario }: { usuario: UsuarioGestionEdicion }) {
  const [state, action, pending] = useActionState(
    editarUsuarioGestion.bind(null, usuario.id_usuario),
    vacio
  );

  return (
    <form className="login-form" action={action} noValidate>
      <h3>Datos personales</h3>
      <div className="campo">
        <label htmlFor="email">Mail (cuenta de acceso)</label>
        <input id="email" type="email" value={usuario.mail_usuario ?? ""} readOnly />
      </div>
      <div className="campo">
        <label htmlFor="nombre_usuario">Nombre</label>
        <input
          id="nombre_usuario"
          name="nombre_usuario"
          defaultValue={usuario.nombre_usuario}
          autoComplete="given-name"
        />
      </div>
      <div className="campo">
        <label htmlFor="apellido_usuario">Apellido</label>
        <input
          id="apellido_usuario"
          name="apellido_usuario"
          defaultValue={usuario.apellido_usuario}
          autoComplete="family-name"
        />
      </div>
      <div className="campo">
        <label htmlFor="fecha_nacimiento_usuario">Fecha de nacimiento</label>
        <input id="fecha_nacimiento_usuario" type="date" value={usuario.fecha_nacimiento_usuario} readOnly />
      </div>
      <div className="campo">
        <label htmlFor="dni_usuario">DNI</label>
        <input id="dni_usuario" value={String(usuario.dni_usuario ?? "")} readOnly />
      </div>
      <div className="campo">
        <label htmlFor="telefono_usuario">Teléfono</label>
        <input
          id="telefono_usuario"
          name="telefono_usuario"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          defaultValue={usuario.telefono_usuario}
        />
      </div>
      {state.error && <p className="mensaje-error" role="alert">{state.error}</p>}
      <button className="boton-principal" type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar datos"}
      </button>
    </form>
  );
}
