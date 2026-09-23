import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRecepcion } from "@/lib/auth";
import { listarObrasSociales, obtenerPaciente } from "@/lib/pacientes/actions";
import { EditarPacienteForm } from "@/components/pacientes/EditarPacienteForm";
import { esIdPaciente } from "@/lib/pacientes/validar";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditarPacientePage({ params }: Props) {
  await exigirRecepcion();
  const { id } = await params;

  if (!esIdPaciente(id)) notFound();

  const [{ data: paciente, error }, { data: obras, error: errorObras }] =
    await Promise.all([obtenerPaciente(id), listarObrasSociales()]);

  if (error || !paciente) notFound();

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera">
        <div>
          <h2>Editar paciente</h2>
          <p className="texto-suave">
            Podés corregir contacto y obras sociales. DNI y fecha de nacimiento no
            cambian.
          </p>
        </div>
        <Link className="boton-texto" href="/pacientes">
          Volver
        </Link>
      </div>

      {errorObras && <p className="mensaje-error">{errorObras}</p>}
      <div className="tarjeta">
        <EditarPacienteForm paciente={paciente} obras={obras} />
      </div>
    </section>
  );
}
