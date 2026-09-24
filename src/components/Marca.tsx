// Logo del login: isotipo + "Kine" azul y "Sys" verde, como el logo del centro.
export function Marca() {
  return (
    <div className="brand">
      <img src="/logo-kinesys.svg" alt="" />
      <h1>
        Kine<span className="marca-sys">Sys</span>
      </h1>
      <p>Centro médico y kinesiología</p>
    </div>
  );
}
