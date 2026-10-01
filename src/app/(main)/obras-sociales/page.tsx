import { exigirGerente } from "@/lib/auth";
import { listarObrasSocialesCatalogo } from "@/lib/obras-sociales/actions";
import { CatalogoObrasSociales } from "@/components/obras-sociales/CatalogoObrasSociales";

export default async function ObrasSocialesPage({
  searchParams,
}: {
  searchParams: Promise<{ creada?: string }>;
}) {
  await exigirGerente();
  const [{ data, error }, { creada }] = await Promise.all([
    listarObrasSocialesCatalogo(),
    searchParams,
  ]);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Obras sociales</h2>
          <p className="texto-suave">
            Administrá el catálogo que usa Recepción al registrar pacientes. Desactivar no borra la obra ni cambia turnos ya otorgados.
          </p>
        </div>
      </div>

      {creada === "1" && <p className="mensaje-ok" role="status">Obra social registrada.</p>}
      {error && <p className="mensaje-error" role="alert">{error}</p>}

      <CatalogoObrasSociales obras={data} />
    </section>
  );
}
