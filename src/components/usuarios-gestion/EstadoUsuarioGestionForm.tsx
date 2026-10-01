"use client";

import { useState, useTransition } from "react";
import { cambiarEstadoUsuarioGestion } from "@/lib/usuarios-gestion/actions";
import type { UsuarioGestionEdicion } from "@/lib/usuarios-gestion/tipos";

export function EstadoUsuarioGestionForm({ usuario }: { usuario: UsuarioGestionEdicion }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bloqueadoDesactivar = usuario.activo && usuario.es_ultimo_gerente_activo;
  const siguienteActivo = !usuario.activo;

  return (
    <div className="login-form">
      <h3>Estado</h3>
      <p>
        <span className={usuario.activo ? "badge-activo" : "badge-inactivo"}>
          {usuario.activo ? "Activo" : "Inactivo"}
        </span>
      </p>
      {bloqueadoDesactivar && (
        <p className="texto-suave">Es el único Gerente activo. No se puede desactivar.</p>
      )}
      <button
        className={`boton-pill ${usuario.activo ? "boton-peligro" : ""}`}
        type="button"
        disabled={isPending || bloqueadoDesactivar}
        onClick={() => {
          if (usuario.activo) {
            const aviso = usuario.es_usuario_actual
              ? "Te vas a desactivar. Se cierra la sesión. ¿Continuar?"
              : "Esta persona no va a poder entrar hasta que la reactives. La cuenta no se borra. ¿Desactivar?";
            if (!window.confirm(aviso)) return;
          }
          startTransition(async () => {
            const resultado = await cambiarEstadoUsuarioGestion(usuario.id_usuario, siguienteActivo);
            setError(resultado.error);
          });
        }}
      >
        {isPending ? "..." : usuario.activo ? "Desactivar" : "Activar"}
      </button>
      {error && <p className="mensaje-error" role="alert">{error}</p>}
    </div>
  );
}
