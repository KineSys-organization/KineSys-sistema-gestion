import { exigirGerente } from "@/lib/auth";
import { listarServicios } from "@/lib/servicios/actions";
import { ServiciosPanel } from "@/components/servicios/ServiciosPanel";

export default async function ServiciosPage() {
  await exigirGerente();
  const { data, error } = await listarServicios();

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Servicios</h2>
          <p className="texto-suave">Tratamientos del consultorio: duración, granularidad y precio.</p>
        </div>
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      <ServiciosPanel servicios={data} />
    </section>
  );
}
