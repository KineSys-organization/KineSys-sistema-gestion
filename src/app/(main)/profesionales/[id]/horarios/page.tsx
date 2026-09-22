import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirGerente } from "@/lib/auth";
import { consultarHorarios } from "@/lib/profesionales/horarios-actions";
import { DIAS_SEMANA, esIdProfesional } from "@/lib/profesionales/horarios";
import { HorariosForm } from "@/components/profesionales/HorariosForm";

export default async function HorariosPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirGerente();
  const { id } = await params;
  if (!esIdProfesional(id)) notFound();
  const { data, error } = await consultarHorarios(id);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Horarios de atención</h2>
          {data && <p>{data.apellido_usuario}, {data.nombre_usuario}</p>}
          <p className="texto-suave">Las franjas se repiten cada semana. Podés cargar mañana y tarde en un mismo día.</p>
        </div>
        <Link className="boton-secundario boton-inline" href="/profesionales">Volver</Link>
      </div>
      {error && <p className="mensaje-error" role="alert">{error}</p>}
      {data && (
        <div className="modulo-grid">
          <div className="tarjeta">
            <h3>Agregar franja</h3>
            {data.tiene_servicios ? <HorariosForm id={id} /> : (
              <p className="mensaje-error">El profesional debe tener al menos un servicio asociado para cargar horarios.</p>
            )}
          </div>
          <div className="horarios-lista">
            <h3>Franjas semanales</h3>
            {data.franjas.length === 0 ? (
              <p className="texto-suave">No tiene horarios configurados.</p>
            ) : (
              <table className="tabla">
                <caption className="solo-lectores">Horarios semanales del profesional</caption>
                <thead><tr><th scope="col">Día</th><th scope="col">Inicio</th><th scope="col">Fin</th></tr></thead>
                <tbody>{data.franjas.map((franja) => (
                  <tr key={franja.id_franja}>
                    <td>{DIAS_SEMANA[franja.dia_semana - 1]}</td>
                    <td>{franja.hora_inicio.slice(0, 5)}</td>
                    <td>{franja.hora_fin.slice(0, 5)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <p className="aviso-accion">
              {data.habilitado_turnos
                ? "El profesional tiene servicios y horarios configurados para recibir turnos."
                : "Para recibir turnos, el profesional debe estar activo y tener al menos un servicio y una franja horaria."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

