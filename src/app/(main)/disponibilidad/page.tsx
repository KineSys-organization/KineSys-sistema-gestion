import { exigirRecepcion } from "@/lib/auth";
import { listarProfesionalesParaDisponibilidad } from "@/lib/disponibilidad/actions";
import { DisponibilidadForm } from "@/components/disponibilidad/DisponibilidadForm";

export default async function DisponibilidadPage() {
  await exigirRecepcion();
  const { data, error } = await listarProfesionalesParaDisponibilidad();

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Disponibilidad</h2>
          <p className="texto-suave">
            Consultá horarios libres de un profesional para un servicio y una
            fecha (hasta 30 días).
          </p>
        </div>
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      <DisponibilidadForm profesionales={data} />
    </section>
  );
}
