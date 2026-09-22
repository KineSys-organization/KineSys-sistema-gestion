import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { Navegacion } from "@/components/Navegacion";
import type { UsuarioGestion } from "@/lib/auth";

export function BarraGestion({ usuario }: { usuario: UsuarioGestion }) {
  return (
    <header className="dashboard-barra">
      <div className="dashboard-barra-izq">
        <Link href="/" className="dashboard-marca">
          <img src="/logo-kinesys.svg" alt="" />
          <span>KineSys</span>
        </Link>
        <Navegacion rol={usuario.rol_usuario} />
      </div>
      <LogoutButton className="boton-salida" />
    </header>
  );
}
