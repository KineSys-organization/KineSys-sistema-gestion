import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioGestion } from "@/lib/auth";
import { MENSAJE_SIN_PERMISO, puedeAcceder, puedeHacer } from "@/lib/auth/permisos";

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const usuario = await obtenerUsuarioGestion();
  if (!usuario) {
    redirect("/login");
  }

  // HU-08: exigirGerente / exigirRecepcion mandan acá con ?error=sin-permiso.
  const { error } = await searchParams;
  const sinPermiso = error === "sin-permiso";

  const rol = usuario.rol_usuario;
  const tarjetas = [
    {
      href: "/pacientes",
      titulo: "Pacientes",
      texto: "Registrar, buscar y editar datos de contacto.",
    },
    {
      href: "/disponibilidad",
      titulo: "Disponibilidad",
      texto: "Consultar horarios libres de un profesional.",
    },
    {
      href: "/agenda",
      titulo: "Agenda",
      texto: "Consultar los turnos asignados a un profesional.",
    },
    {
      href: "/servicios",
      titulo: "Servicios",
      texto: puedeHacer(rol, "servicios.gestionar")
        ? "Definir tratamientos, duración y precio."
        : "Consultar tratamientos, duración y precio.",
    },
    {
      href: "/profesionales",
      titulo: "Profesionales",
      texto: "Registrar profesionales, sus servicios y horarios.",
    },
  ].filter((tarjeta) => puedeAcceder(rol, tarjeta.href));

  return (
    <section className="dashboard-cuerpo">
      {sinPermiso && (
        <p className="mensaje-error aviso-inicio" role="alert">
          {MENSAJE_SIN_PERMISO}. Volviste al inicio.
        </p>
      )}

      <h2>
        Bienvenido/a {usuario.nombre_usuario} {usuario.apellido_usuario}
      </h2>
      <p className="rol">{rol}</p>

      {tarjetas.length > 0 && (
        <div className="tarjetas-inicio">
          {tarjetas.map((tarjeta) => (
            <Link key={tarjeta.href} className="tarjeta-link" href={tarjeta.href}>
              <strong>{tarjeta.titulo}</strong>
              <span>{tarjeta.texto}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
