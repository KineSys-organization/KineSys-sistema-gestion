import Link from "next/link";
import { exigirGerente } from "@/lib/auth";
import { listarServicios } from "@/lib/servicios/actions";
import { AltaProfesionalForm } from "@/components/profesionales/AltaProfesionalForm";

export default async function NuevoProfesionalPage() {
  await exigirGerente();
  const { data, error } = await listarServicios();

  return (
    <section className="modulo modulo-angosto">
      <p>
        <Link href="/profesionales">← Volver al listado</Link>
      </p>
      <h2>Registrar profesional</h2>
      <p className="texto-suave">
        Se crea la cuenta de usuario (rol Profesional) y se asocian los servicios en el mismo paso.
      </p>
      {error && <p className="mensaje-error" role="alert">{error}</p>}
      <div className="tarjeta">
        <AltaProfesionalForm servicios={data} />
      </div>
    </section>
  );
}
