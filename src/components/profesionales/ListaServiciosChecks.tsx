import type { Servicio } from "@/lib/servicios/tipos";

export function ListaServiciosChecks({
  servicios,
  seleccionados = [],
}: {
  servicios: Servicio[];
  seleccionados?: string[];
}) {
  const activos = servicios.filter((servicio) => servicio.activo || seleccionados.includes(servicio.id_servicio));

  if (activos.length === 0) {
    return (
      <p className="texto-suave">No hay servicios activos. Primero cargá uno en Configuración.</p>
    );
  }

  return (
    <div className="lista-checks">
      {activos.map((servicio) => (
        <label key={servicio.id_servicio} className="check-item">
          <input
            type="checkbox"
            name="servicios"
            value={servicio.id_servicio}
            defaultChecked={seleccionados.includes(servicio.id_servicio)}
          />
          <span>{servicio.nombre_servicio}{!servicio.activo && " (inactivo)"}</span>
        </label>
      ))}
    </div>
  );
}
