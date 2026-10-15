import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRecepcion } from "@/lib/auth";
import { listarObrasSociales, obtenerPaciente } from "@/lib/pacientes/actions";
import { EditarPacienteForm } from "@/components/pacientes/EditarPacienteForm";
import { EstadoPacienteForm } from "@/components/pacientes/EstadoPacienteForm";
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
    <section className="modulo modulo-paciente-ficha">
      <div className="modulo-cabecera">
        <div>
          <h2>Ficha del paciente</h2>
          <p className="texto-suave">
            {paciente.apellido_paciente}, {paciente.nombre_paciente} · DNI {paciente.dni_paciente}
          </p>
        </div>
        <Link className="boton-pill" href="/pacientes">
          Volver
        </Link>
      </div>

      {errorObras && <p className="mensaje-error" role="alert">{errorObras}</p>}
      <div className="paciente-ficha-grid">
        <div className="tarjeta">
          <h3>Datos del paciente</h3>
          <p className="texto-suave">
            Podés corregir contacto y obras sociales. DNI y fecha de nacimiento no cambian.
          </p>
          <EditarPacienteForm paciente={paciente} obras={obras} />
        </div>
        <div className="tarjeta">
          <EstadoPacienteForm paciente={paciente} />
        </div>
      </div>
    </section>
  );
}
