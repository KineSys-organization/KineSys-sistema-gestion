import Link from "next/link";
import type { UsuarioGestion } from "@/lib/auth";

export function Navegacion({ rol }: { rol: UsuarioGestion["rol_usuario"] }) {
  return (
    <nav className="nav-app">
      <Link href="/">Inicio</Link>
      {rol === "Gerente" && (
        <>
          <Link href="/profesionales">Profesionales</Link>
          <Link href="/servicios">Servicios</Link>
        </>
      )}
    </nav>
  );
}
