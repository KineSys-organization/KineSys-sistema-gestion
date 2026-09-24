import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirGerente } from "@/lib/auth";
import { obtenerProfesional } from "@/lib/profesionales/actions";
import { listarServicios } from "@/lib/servicios/actions";
import { esIdProfesional } from "@/lib/profesionales/horarios";
import { EdicionProfesionalForm } from "@/components/profesionales/EdicionProfesionalForm";

export default async function EditarProfesionalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirGerente();
  const { id } = await params;
  if (!esIdProfesional(id)) notFound();

  const [resProfesional, resServicios] = await Promise.all([
    obtenerProfesional(id),
    listarServicios(),
  ]);

  if (resProfesional.error || !resProfesional.data || resServicios.error) {
    return <section className="modulo"><h2>Editar profesional</h2>
      <p className="mensaje-error" role="alert">{resProfesional.error ?? resServicios.error ?? "El profesional no existe"}</p>
      <Link href="/profesionales">Volver a profesionales</Link>
    </section>;
  }

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Editar profesional</h2>
          <p className="texto-suave">
            Modificá los datos personales, matrícula y servicios asociados.
          </p>
        </div>
        <Link className="boton-secundario boton-inline" href="/profesionales">
          Volver
        </Link>
      </div>

      <div className="tarjeta">
        <EdicionProfesionalForm
          key={JSON.stringify(resProfesional.data)}
          profesional={resProfesional.data}
          servicios={resServicios.data}
        />
      </div>
    </section>
  );
}
