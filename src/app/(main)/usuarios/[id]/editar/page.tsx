import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirGerente } from "@/lib/auth";
import { obtenerDetalleUsuarioGestion } from "@/lib/usuarios-gestion/actions";
import { esIdUsuarioGestion } from "@/lib/usuarios-gestion/validar";
import { EdicionUsuarioGestionForm } from "@/components/usuarios-gestion/EdicionUsuarioGestionForm";
import { CambiarRolUsuarioForm } from "@/components/usuarios-gestion/CambiarRolUsuarioForm";
import { EstadoUsuarioGestionForm } from "@/components/usuarios-gestion/EstadoUsuarioGestionForm";

export default async function EditarUsuarioGestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirGerente();
  const { id } = await params;
  if (!esIdUsuarioGestion(id)) notFound();

  const { data, error } = await obtenerDetalleUsuarioGestion(id);
  if (error || !data) {
    return (
      <section className="modulo">
        <h2>Editar usuario</h2>
        <p className="mensaje-error" role="alert">{error ?? "El usuario no existe"}</p>
        <Link href="/usuarios">Volver a personal interno</Link>
      </section>
    );
  }

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Editar usuario</h2>
          <p className="texto-suave">
            Nombre, apellido y teléfono se editan. Mail, DNI y fecha de nacimiento no.
            {data.es_usuario_actual ? " Estás viendo tu propia cuenta." : ""}
          </p>
        </div>
        <Link className="boton-secundario boton-inline" href="/usuarios">
          Volver
        </Link>
      </div>

      <div className="tarjeta">
        <EdicionUsuarioGestionForm
          key={`datos-${data.telefono_usuario}-${data.nombre_usuario}`}
          usuario={data}
        />
      </div>
      <div className="tarjeta">
        <CambiarRolUsuarioForm key={`rol-${data.rol_usuario}`} usuario={data} />
      </div>
      <div className="tarjeta">
        <EstadoUsuarioGestionForm key={`estado-${String(data.activo)}`} usuario={data} />
      </div>
    </section>
  );
}
