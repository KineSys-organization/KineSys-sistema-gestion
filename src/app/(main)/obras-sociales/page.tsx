import { exigirGerente } from "@/lib/auth";
import { listarObrasSocialesCatalogo } from "@/lib/obras-sociales/actions";
import { AltaObraSocialForm } from "@/components/obras-sociales/AltaObraSocialForm";

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
          <p className="texto-suave">Administrá el catálogo que usa Recepción al registrar pacientes.</p>
        </div>
      </div>

      {creada === "1" && <p className="mensaje-ok" role="status">Obra social registrada.</p>}
      {error && <p className="mensaje-error" role="alert">{error}</p>}

      <div className="modulo-grid">
        <section className="tarjeta">
          <h3>Registrar obra social</h3>
          <AltaObraSocialForm />
        </section>

        <section className="tarjeta">
          <h3>Obras sociales cargadas</h3>
          {data.length === 0 ? (
            <p className="texto-suave">Todavía no hay obras sociales en el catálogo.</p>
          ) : (
            <table className="tabla">
              <thead><tr><th>Nombre</th><th>Estado</th></tr></thead>
              <tbody>
                {data.map((obra) => (
                  <tr key={obra.id_obra_social}>
                    <td>{obra.nombre_obra_social}</td>
                    <td>
                      <span className={obra.activo ? "badge-activo" : "badge-inactivo"}>
                        {obra.activo ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </section>
  );
}
