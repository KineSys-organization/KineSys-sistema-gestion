import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { listarObrasSociales } from "@/lib/pacientes/actions";
import { AltaPacienteForm } from "@/components/pacientes/AltaPacienteForm";

export default async function NuevoPacientePage() {
  await exigirRecepcion();
  const { data: obras, error } = await listarObrasSociales();

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera">
        <div>
          <h2>Nuevo paciente</h2>
          <p className="texto-suave">
            Datos personales y, si corresponde, obras sociales del catálogo.
          </p>
        </div>
        <Link className="boton-texto" href="/pacientes">
          Volver
        </Link>
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      <div className="tarjeta">
        <AltaPacienteForm obras={obras} />
      </div>
    </section>
  );
}
