import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioGestion } from "@/lib/auth";

export default async function InicioPage() {
  const usuario = await obtenerUsuarioGestion();
  if (!usuario) {
    redirect("/login");
  }

  return (
    <section className="dashboard-cuerpo">
      <h2>
        Bienvenido/a {usuario.nombre_usuario} {usuario.apellido_usuario}
      </h2>
      <p className="rol">{usuario.rol_usuario}</p>

      {usuario.rol_usuario === "Gerente" && (
        <div className="tarjetas-inicio">
          <Link className="tarjeta-link" href="/servicios">
            <strong>Servicios</strong>
            <span>Definir tratamientos, duración y precio.</span>
          </Link>
          <Link className="tarjeta-link" href="/profesionales">
            <strong>Profesionales</strong>
            <span>Registrar un profesional con sus servicios.</span>
          </Link>
        </div>
      )}
    </section>
  );
}
