import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioGestion } from "@/lib/auth";

export default async function InicioPage() {
  const usuario = await obtenerUsuarioGestion();
  if (!usuario) {
    redirect("/login");
  }

  const esGerente = usuario.rol_usuario === "Gerente";
  const esRecepcion =
    usuario.rol_usuario === "Gerente" || usuario.rol_usuario === "Mesa de Entradas";

  return (
    <section className="dashboard-cuerpo">
      <h2>
        Bienvenido/a {usuario.nombre_usuario} {usuario.apellido_usuario}
      </h2>
      <p className="rol">{usuario.rol_usuario}</p>

      {(esGerente || esRecepcion) && (
        <div className="tarjetas-inicio">
          {esRecepcion && (
            <Link className="tarjeta-link" href="/pacientes">
              <strong>Pacientes</strong>
              <span>Registrar, buscar y editar datos de contacto.</span>
            </Link>
          )}
          {esGerente && (
            <>
              <Link className="tarjeta-link" href="/servicios">
                <strong>Servicios</strong>
                <span>Definir tratamientos, duración y precio.</span>
              </Link>
              <Link className="tarjeta-link" href="/profesionales">
                <strong>Profesionales</strong>
                <span>Registrar un profesional con sus servicios.</span>
              </Link>
            </>
          )}
        </div>
      )}
    </section>
  );
}
