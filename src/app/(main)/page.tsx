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
    </section>
  );
}
