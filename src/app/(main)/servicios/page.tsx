import { exigirRecepcion } from "@/lib/auth";
import { puedeHacer } from "@/lib/auth/permisos";
import { listarServicios } from "@/lib/servicios/actions";
import { ServiciosPanel } from "@/components/servicios/ServiciosPanel";

export default async function ServiciosPage() {
  // HU-08: Mesa de Entradas puede ver el listado; solo el Gerente lo modifica.
  const usuario = await exigirRecepcion();
  const puedeGestionar = puedeHacer(usuario.rol_usuario, "servicios.gestionar");
  const { data, error } = await listarServicios();

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Servicios</h2>
          <p className="texto-suave">
            {puedeGestionar
              ? "Tratamientos del consultorio: duración, granularidad y precio."
              : "Tratamientos del consultorio (solo lectura)."}
          </p>
        </div>
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      <ServiciosPanel servicios={data} puedeGestionar={puedeGestionar} />
    </section>
  );
}
