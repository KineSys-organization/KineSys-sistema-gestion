import Link from "next/link";
import type { UsuarioGestion } from "@/lib/auth";

function puedeRecepcion(rol: UsuarioGestion["rol_usuario"]) {
  return rol === "Gerente" || rol === "Mesa de Entradas";
}

export function Navegacion({ rol }: { rol: UsuarioGestion["rol_usuario"] }) {
  return (
    <nav className="nav-app">
      <Link href="/">Inicio</Link>
      {puedeRecepcion(rol) && (
        <>
          <Link href="/pacientes">Pacientes</Link>
          <Link href="/disponibilidad">Disponibilidad</Link>
        </>
      )}
      {rol === "Gerente" && (
        <>
          <Link href="/profesionales">Profesionales</Link>
          <Link href="/servicios">Servicios</Link>
        </>
      )}
    </nav>
  );
}
