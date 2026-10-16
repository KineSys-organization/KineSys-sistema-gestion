import Link from "next/link";
import { exigirPaciente } from "@/lib/portal/acceso";
import { salirPortal } from "../ingresar/actions";

// HU-23. Barra del portal del paciente: sin el menú de gestión, solo sus turnos.
export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const paciente = await exigirPaciente();

  return (
    <div className="dashboard">
      <header className="dashboard-barra">
        <div className="dashboard-barra-izq">
          <Link href="/portal" className="dashboard-marca">
            <img src="/logo-kinesys.svg" alt="" />
            <span>
              Kine<span className="marca-sys">Sys</span>
            </span>
          </Link>
          <nav className="nav-app" aria-label="Turnos online">
            <Link href="/portal">Mis turnos</Link>
            <Link href="/portal/nuevo">Sacar turno</Link>
          </nav>
        </div>
        <div className="dashboard-barra-der">
          <span className="usuario-conectado">
            {paciente.nombre_paciente} {paciente.apellido_paciente} · <strong>Paciente</strong>
          </span>
          <form action={salirPortal}>
            <button type="submit" className="boton-salida">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main id="contenido">{children}</main>
    </div>
  );
}
