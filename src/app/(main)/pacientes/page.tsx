import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { filtrarPacientes, listarObrasSociales } from "@/lib/pacientes/actions";
import { leerFiltrosPacientes, OBRA_PARTICULAR, RANGOS_EDAD } from "@/lib/pacientes/validar";

type Props = {
  searchParams: Promise<{ q?: string; obra?: string; edad?: string }>;
};

// HU-04 + filtros: se ve el listado apenas se entra, y se acota por texto (DNI o
// nombre), obra social (o Particular) y rango etario. Los filtros viven en la URL.
export default async function PacientesPage({ searchParams }: Props) {
  await exigirRecepcion();
  const params = await searchParams;
  const filtros = leerFiltrosPacientes(params);

  const [{ data, error }, { data: obras }] = await Promise.all([
    filtrarPacientes(filtros),
    listarObrasSociales(),
  ]);

  const hayFiltros =
    filtros.texto !== "" || filtros.obra !== null || filtros.edadMin !== null;
  const rangoElegido = RANGOS_EDAD.find((r) => r.valor === params.edad)?.valor ?? "";

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Pacientes</h2>
          <p className="texto-suave">
            Buscá y filtrá pacientes, o registrá uno nuevo.
          </p>
        </div>
        <Link className="boton-principal boton-inline" href="/pacientes/nuevo">
          Nuevo paciente
        </Link>
      </div>

      <form className="tarjeta bloque filtros-pacientes" method="get" role="search">
        <div className="campo campo-ancho">
          <label htmlFor="q">Buscar</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filtros.texto}
            placeholder="DNI o nombre / apellido"
          />
        </div>
        <div className="campo">
          <label htmlFor="obra">Obra social</label>
          <select id="obra" name="obra" defaultValue={filtros.obra ?? ""}>
            <option value="">Todas</option>
            <option value={OBRA_PARTICULAR}>Particular (sin obra social)</option>
            {obras.map((obra) => (
              <option key={obra.id_obra_social} value={obra.id_obra_social}>
                {obra.nombre_obra_social}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="edad">Edad</label>
          <select id="edad" name="edad" defaultValue={rangoElegido}>
            <option value="">Todas</option>
            {RANGOS_EDAD.map((rango) => (
              <option key={rango.valor} value={rango.valor}>
                {rango.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="fila-acciones">
          <button className="boton-principal boton-inline" type="submit">
            Filtrar
          </button>
          {hayFiltros && (
            <Link className="boton-secundario boton-inline" href="/pacientes">
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}

      <p className="texto-suave" role="status">
        {data.length === 0
          ? hayFiltros
            ? "No hay pacientes con esos filtros."
            : "Todavía no hay pacientes registrados."
          : `${data.length} ${data.length === 1 ? "paciente" : "pacientes"}${
              data.length === 100 ? " (se muestran los primeros 100; acotá la búsqueda)" : ""
            }`}
        {data.length === 0 && (
          <>
            {" "}
            <Link href="/pacientes/nuevo">Registrar nuevo</Link>
          </>
        )}
      </p>

      {data.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DNI</th>
                <th>Edad</th>
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
                  <td>{paciente.edad ?? "—"}</td>
                  <td>{paciente.telefono_paciente}</td>
                  <td>{paciente.mail_paciente}</td>
                  <td>
                    {(paciente.obras_sociales ?? [])
                      .map((obra) => `${obra.nombre_obra_social} (${obra.numero_afiliado})`)
                      .join(", ") || "Particular"}
                  </td>
                  <td>
                    <Link className="boton-pill" href={`/pacientes/${paciente.id_paciente}`}>
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
