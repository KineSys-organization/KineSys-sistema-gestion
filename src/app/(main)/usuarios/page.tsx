import Link from "next/link";
import { exigirGerente } from "@/lib/auth";
import { listarUsuariosGestion } from "@/lib/usuarios-gestion/actions";
import { BotonAlternarUsuarioGestion } from "@/components/usuarios-gestion/BotonAlternarUsuarioGestion";

export default async function UsuariosGestionPage() {
  const sesion = await exigirGerente();
  const { data, error } = await listarUsuariosGestion();
  const gerentesActivos = data.filter(
    (usuario) => usuario.rol_usuario === "Gerente" && usuario.activo
  ).length;

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Personal interno</h2>
          <p className="texto-suave">Gerentes y Mesa de Entradas con acceso al sistema.</p>
        </div>
        <Link className="boton-principal boton-inline" href="/usuarios/nuevo">
          Nuevo usuario
        </Link>
      </div>

      {error && <p className="mensaje-error" role="alert">{error}</p>}

      {data.length === 0 ? (
        <p className="texto-suave">Todavía no hay usuarios de gestión registrados.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Mail</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((usuario) => {
              const esUltimoGerenteActivo =
                usuario.rol_usuario === "Gerente" && usuario.activo && gerentesActivos === 1;
              return (
                <tr key={usuario.id_usuario}>
                  <td>
                    {usuario.apellido_usuario}, {usuario.nombre_usuario}
                  </td>
                  <td>{usuario.mail_usuario}</td>
                  <td>{usuario.rol_usuario}</td>
                  <td>
                    <span className={usuario.activo ? "badge-activo" : "badge-inactivo"}>
                      {usuario.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <div className="fila-acciones">
                      <Link className="boton-pill" href={`/usuarios/${usuario.id_usuario}/editar`}>
                        Editar
                      </Link>
                      <BotonAlternarUsuarioGestion
                        id={usuario.id_usuario}
                        activo={usuario.activo}
                        esUsuarioActual={sesion.id_usuario === usuario.id_usuario}
                        desactivarBloqueado={esUltimoGerenteActivo}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
