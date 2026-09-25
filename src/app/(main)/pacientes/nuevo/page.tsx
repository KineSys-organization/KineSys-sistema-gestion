import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { listarObrasSociales } from "@/lib/pacientes/actions";
import { urlVolverTurno } from "@/lib/pacientes/validar";
import { AltaPacienteForm } from "@/components/pacientes/AltaPacienteForm";

type Props = {
  searchParams: Promise<{ volver?: string }>;
};

export default async function NuevoPacientePage({ searchParams }: Props) {
  await exigirRecepcion();
  const { data: obras, error } = await listarObrasSociales();
  // Si viene de "Otorgar turno", al registrar vuelve a ese paso con el paciente elegido.
  const volver = urlVolverTurno((await searchParams).volver);

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera">
        <div>
          <h2>Nuevo paciente</h2>
          <p className="texto-suave">
            {volver
              ? "Al registrarlo volvés al turno con el paciente ya elegido."
              : "Datos personales y, si corresponde, obras sociales del catálogo."}
          </p>
        </div>
        <Link className="boton-secundario boton-inline" href={volver ?? "/pacientes"}>
          {volver ? "Volver al turno" : "Volver"}
        </Link>
      </div>

      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
      <div className="tarjeta">
        <AltaPacienteForm obras={obras} volver={volver} />
      </div>
    </section>
  );
}
