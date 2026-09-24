import Link from "next/link";
import { exigirGerente } from "@/lib/auth";
import { listarProfesionales } from "@/lib/profesionales/actions";
import { BotonAlternarProfesional } from "@/components/profesionales/BotonAlternarProfesional";

export default async function ProfesionalesPage() {
  await exigirGerente();
  const { data, error } = await listarProfesionales();

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Profesionales</h2>
          <p className="texto-suave">Cuentas de login con matrícula y servicios asociados.</p>
        </div>
        <Link className="boton-principal boton-inline" href="/profesionales/nuevo">
          Nuevo profesional
        </Link>
      </div>

      {error && <p className="mensaje-error">{error}</p>}

      {data.length === 0 ? (
        <p className="texto-suave">Todavía no hay profesionales registrados.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Mail</th>
              <th>Matrícula</th>
              <th>Servicios</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((profesional) => (
              <tr key={profesional.id_usuario}>
                <td>
                  {profesional.apellido_usuario}, {profesional.nombre_usuario}
                </td>
                <td>{profesional.mail_usuario}</td>
                <td>{profesional.matricula}</td>
                <td>
                  {(profesional.servicios ?? [])
                    .map((servicio) => servicio.nombre_servicio)
                    .join(", ") || "—"}
                </td>
                <td>
                  <span className={profesional.activo ? "badge-activo" : "badge-inactivo"}>
                    {profesional.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>
                  <div className="fila-acciones">
                    <Link className="boton-pill" href={`/profesionales/${profesional.id_usuario}/editar`}>
                      Editar
                    </Link>
                    <Link className="boton-pill" href={`/profesionales/${profesional.id_usuario}/horarios`}>
                      Horarios
                    </Link>
                    <BotonAlternarProfesional id={profesional.id_usuario} activo={profesional.activo} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
