import { exigirGerente } from "@/lib/auth";
import { listarUsuariosGestion } from "@/lib/usuarios-gestion/actions";
import { UsuarioGestionForm } from "@/components/usuarios-gestion/UsuarioGestionForm";

export default async function UsuariosGestionPage() {
  await exigirGerente();
  const { data, error } = await listarUsuariosGestion();
  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div><h2>Personal interno</h2><p className="texto-suave">Gerentes y Mesa de Entradas con acceso al sistema.</p></div>
      </div>
      {error && <p className="mensaje-error" role="alert">{error}</p>}
      <div className="tarjeta modulo-angosto"><h3>Registrar usuario de gestión</h3><UsuarioGestionForm /></div>
      <h3>Usuarios registrados</h3>
      {data.length === 0 ? <p className="texto-suave">Todavía no hay usuarios de gestión registrados.</p> : (
        <table className="tabla">
          <thead><tr><th>Nombre</th><th>Mail</th><th>Rol</th><th>Estado</th></tr></thead>
          <tbody>{data.map((usuario) => (
            <tr key={usuario.id_usuario}>
              <td>{usuario.apellido_usuario}, {usuario.nombre_usuario}</td>
              <td>{usuario.mail_usuario}</td>
              <td>{usuario.rol_usuario}</td>
              <td><span className={usuario.activo ? "badge-activo" : "badge-inactivo"}>{usuario.activo ? "Activo" : "Inactivo"}</span></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
