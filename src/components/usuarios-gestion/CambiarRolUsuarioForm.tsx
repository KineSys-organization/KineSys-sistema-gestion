"use client";

import { useActionState } from "react";
import { cambiarRolUsuarioGestion } from "@/lib/usuarios-gestion/actions";
import type { EstadoFormularioUsuario, UsuarioGestionEdicion } from "@/lib/usuarios-gestion/tipos";

const vacio: EstadoFormularioUsuario = { ok: false, error: null };

export function CambiarRolUsuarioForm({ usuario }: { usuario: UsuarioGestionEdicion }) {
  const [state, action, pending] = useActionState(
    cambiarRolUsuarioGestion.bind(null, usuario.id_usuario),
    vacio
  );
  const bloqueado = usuario.es_ultimo_gerente_activo;

  return (
    <form
      className="login-form"
      action={action}
      noValidate
      onSubmit={(evento) => {
        if (bloqueado) {
          evento.preventDefault();
          return;
        }
        const rol = String(new FormData(evento.currentTarget).get("rol_usuario") ?? "");
        if (usuario.es_usuario_actual && rol === "Mesa de Entradas" && usuario.rol_usuario === "Gerente") {
          const ok = window.confirm(
            "Vas a pasar a Mesa de Entradas. Vas a perder el acceso de Gerente y se cierra la sesión. ¿Continuar?"
          );
          if (!ok) evento.preventDefault();
        }
      }}
    >
      <h3>Rol{usuario.es_usuario_actual ? " (vos)" : ""}</h3>
      <div className="campo">
        <label htmlFor="rol_usuario">Rol</label>
        <select
          id="rol_usuario"
          name="rol_usuario"
          defaultValue={usuario.rol_usuario}
          disabled={bloqueado || pending}
        >
          <option value="Gerente">Gerente</option>
          <option value="Mesa de Entradas">Mesa de Entradas</option>
        </select>
      </div>
      {bloqueado && (
        <p className="texto-suave">Es el único Gerente activo. Asigná otro Gerente antes de bajarlo a Mesa.</p>
      )}
      {state.error && <p className="mensaje-error" role="alert">{state.error}</p>}
      <button className="boton-secundario" type="submit" disabled={pending || bloqueado}>
        {pending ? "Guardando..." : "Cambiar rol"}
      </button>
    </form>
  );
}
