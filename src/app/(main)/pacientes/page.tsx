import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { buscarPacientes } from "@/lib/pacientes/actions";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function PacientesPage({ searchParams }: Props) {
  await exigirRecepcion();
  const params = await searchParams;
  const consulta = (params.q ?? "").trim();
  const { data, error } = await buscarPacientes(consulta);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Pacientes</h2>
          <p className="texto-suave">
            Buscá por DNI o nombre para localizar, o registrá uno nuevo.
          </p>
        </div>
        <Link className="boton-principal boton-inline" href="/pacientes/nuevo">
          Nuevo paciente
        </Link>
      </div>

      <form className="busqueda-pacientes" method="get">
        <div className="campo">
          <label htmlFor="q">Buscar</label>
          <input
            id="q"
            name="q"
            defaultValue={consulta}
            placeholder="DNI o nombre / apellido"
          />
        </div>
        <button className="boton-principal boton-inline" type="submit">
          Buscar
        </button>
      </form>

      {error && <p className="mensaje-error">{error}</p>}

      {!consulta ? (
        <p className="texto-suave">Ingresá un DNI o un nombre para buscar.</p>
      ) : data.length === 0 ? (
        <p className="texto-suave">
          No se encontraron pacientes.{" "}
          <Link href="/pacientes/nuevo">Registrar nuevo</Link>
        </p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>DNI</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Obras sociales</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((paciente) => (
              <tr key={paciente.id_paciente}>
                <td>
                  {paciente.apellido_paciente}, {paciente.nombre_paciente}
                </td>
                <td>{paciente.dni_paciente}</td>
                <td>{paciente.telefono_paciente}</td>
                <td>{paciente.mail_paciente}</td>
                <td>
                  {(paciente.obras_sociales ?? [])
                    .map(
                      (obra) =>
                        `${obra.nombre_obra_social} (${obra.numero_afiliado})`
                    )
                    .join(", ") || "Particular"}
                </td>
                <td>
                  <Link
                    className="boton-pill"
                    href={`/pacientes/${paciente.id_paciente}`}
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
