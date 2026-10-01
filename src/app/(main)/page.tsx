import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioGestion } from "@/lib/auth";
import { MENSAJE_SIN_PERMISO, puedeAcceder, puedeHacer } from "@/lib/auth/permisos";
import { consultarMiAgenda } from "@/lib/atencion/actions";
import { hoyArgentina } from "@/lib/atencion/validar";
import { DashboardProfesional } from "@/components/dashboard/DashboardProfesional";

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mes?: string; dia?: string }>;
}) {
  const usuario = await obtenerUsuarioGestion();
  if (!usuario) {
    redirect("/login");
  }

  // HU-08: exigirGerente / exigirRecepcion mandan acá con ?error=sin-permiso.
  const { error, mes, dia } = await searchParams;
  const sinPermiso = error === "sin-permiso";

  if (usuario.rol_usuario === "Gerente" && !sinPermiso) {
    redirect("/indicadores");
  }
  const rol = usuario.rol_usuario;
  // Ordenadas por uso diario: lo primero que hace cada rol va arriba.
  const tarjetas = [
    {
      href: "/mi-agenda",
      titulo: "Mi agenda",
      texto: "Tus turnos y pacientes del día. Registrá cada atención.",
    },
    {
      href: "/turnos/nuevo",
      titulo: "Otorgar turno",
      texto: "Buscá al paciente, elegí profesional y servicio, mirá los días libres y dá el turno.",
    },
    {
      href: "/agenda",
      titulo: "Agenda",
      texto: "Los turnos de un profesional para un día.",
    },
    {
      href: "/turnos",
      titulo: "Turnos",
      texto: "Buscá un turno por paciente, profesional, fechas o estado.",
    },
    {
      href: "/pagos",
      titulo: "Pagos",
      texto: "Cobros registrados por paciente y período. Se cobra desde el detalle del turno.",
    },
    {
      href: "/pacientes",
      titulo: "Pacientes",
      texto: "Buscar y filtrar por obra social o edad, registrar y editar.",
    },
    {
      href: "/obras-sociales",
      titulo: "Obras sociales",
      texto: "Administrar las obras sociales disponibles para los pacientes.",
    },
    {
      href: "/profesionales",
      titulo: "Profesionales",
      texto: "Registrar profesionales, sus servicios y horarios.",
    },
    {
      href: "/usuarios",
      titulo: "Personal interno",
      texto: "Registrar, editar y activar o desactivar Gerentes y Mesa de Entradas.",
    },
    {
      href: "/servicios",
      titulo: "Servicios",
      texto: puedeHacer(rol, "servicios.gestionar")
        ? "Definir tratamientos, duración y precio."
        : "Consultar tratamientos, duración y precio.",
    },
    {
      href: "/indicadores",
      titulo: "Indicadores",
      texto: "Turnos por estado y pacientes nuevos en un período.",
    },
  ].filter((tarjeta) => puedeAcceder(rol, tarjeta.href));

  // HU-12: el Profesional ve de entrada cómo viene su día.
  const hoy = rol === "Profesional" ? await consultarMiAgenda(hoyArgentina()) : null;
  const turnosHoy = (hoy?.data?.turnos ?? []).filter((t) => t.estado !== "cancelado");
  const pendientes = turnosHoy.filter((t) => t.atendible);
  const proximo = pendientes[0];

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

      {hoy && (
        <div className="resumen-dia">
          <div>
            <strong>
              {turnosHoy.length === 0
                ? "Hoy no tenés turnos"
                : `Hoy tenés ${turnosHoy.length} ${turnosHoy.length === 1 ? "turno" : "turnos"}`}
            </strong>
            <span>
              {turnosHoy.length === 0
                ? "Podés revisar otros días en tu agenda."
                : pendientes.length === 0
                  ? "Ya registraste todas las atenciones del día."
                  : `${pendientes.length} por atender · Próximo: ${proximo.hora_inicio} ${proximo.apellido_paciente}, ${proximo.nombre_paciente}`}
            </span>
          </div>
          <Link
            className="boton-principal boton-inline"
            href={proximo ? `/mi-agenda/${proximo.id_turno}` : "/mi-agenda"}
          >
            {proximo ? "Atender al próximo" : "Ver mi agenda"}
          </Link>
        </div>
      )}

      {/* HU-15: dashboard propio del Profesional (Recepción y Gerente usan /agenda). */}
      {rol === "Profesional" && (
        <DashboardProfesional
          hoy={hoyArgentina()}
          mesPedido={typeof mes === "string" ? mes : ""}
          diaPedido={typeof dia === "string" ? dia : ""}
        />
      )}

      {tarjetas.length > 0 && (
        <div className="tarjetas-inicio">
          {tarjetas.map((tarjeta) => (
            <Link
              key={tarjeta.href}
              className="tarjeta-link"
              href={tarjeta.href}
            >
              <strong>{tarjeta.titulo}</strong>
              <span>{tarjeta.texto}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
