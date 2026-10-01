"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { MenuGerente } from "@/components/MenuGerente";
import { Navegacion } from "@/components/Navegacion";
import type { UsuarioGestion } from "@/lib/auth";

const CLAVE = "kinesys-sidebar";

function iniciales(usuario: UsuarioGestion) {
  const n = usuario.nombre_usuario.trim().charAt(0);
  const a = usuario.apellido_usuario.trim().charAt(0);
  return `${n}${a}`.toUpperCase() || "G";
}

function ShellClasico({
  usuario,
  children,
}: {
  usuario: UsuarioGestion;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard">
      <header className="dashboard-barra">
        <div className="dashboard-barra-izq">
          <Link href="/" className="dashboard-marca">
            <img src="/logo-kinesys.svg" alt="" />
            <span>
              Kine<span className="marca-sys">Sys</span>
            </span>
          </Link>
          <Navegacion rol={usuario.rol_usuario} />
        </div>
        <div className="dashboard-barra-der">
          <span className="usuario-conectado">
            {usuario.nombre_usuario} {usuario.apellido_usuario} ·{" "}
            <strong>{usuario.rol_usuario}</strong>
          </span>
          <LogoutButton className="boton-salida" />
        </div>
      </header>
      {children}
    </div>
  );
}

function ShellGerente({
  usuario,
  children,
}: {
  usuario: UsuarioGestion;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(true);
  const ruta = usePathname();
  const primerRender = useRef(true);

  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE);
    if (guardado === "cerrado") setAbierto(false);
    else if (guardado === "abierto") setAbierto(true);
    else setAbierto(window.matchMedia("(min-width: 900px)").matches);
  }, []);

  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    if (window.matchMedia("(max-width: 899px)").matches) setAbierto(false);
  }, [ruta]);

  function guardar(siguiente: boolean) {
    setAbierto(siguiente);
    window.localStorage.setItem(CLAVE, siguiente ? "abierto" : "cerrado");
  }

  return (
    <div className={`shell-gerente${abierto ? "" : " menu-cerrado"}`}>
      <header className="shell-gerente-barra">
        <Link href="/indicadores" className="dashboard-marca">
          <img src="/logo-kinesys.svg" alt="" />
          <span>
            Kine<span className="marca-sys">Sys</span>
            <small>Gestión del consultorio</small>
          </span>
        </Link>
        <div className="shell-gerente-usuario">
          <span className="usuario-conectado">
            {usuario.nombre_usuario} {usuario.apellido_usuario}
            <strong>{usuario.rol_usuario}</strong>
          </span>
          <span className="usuario-avatar" aria-hidden>
            {iniciales(usuario)}
          </span>
          <LogoutButton className="boton-salida" />
        </div>
      </header>

      <div className="shell-gerente-cuerpo">
        {abierto && (
          <button
            type="button"
            className="menu-fondo"
            aria-label="Cerrar menú"
            onClick={() => guardar(false)}
          />
        )}
        <aside className="menu-lateral-claro" aria-label="Menú">
          <MenuGerente colapsado={!abierto} />
          <button
            type="button"
            className="menu-plegar"
            aria-expanded={abierto}
            onClick={() => guardar(!abierto)}
          >
            {abierto ? "‹‹" : "››"}
          </button>
        </aside>
        <div className="dashboard-contenido">
          <header className="barra-movil">
            <button type="button" className="menu-ocultar" onClick={() => guardar(!abierto)}>
              Menú
            </button>
            <Link href="/indicadores" className="dashboard-marca">
              <img src="/logo-kinesys.svg" alt="" />
              <span>
                Kine<span className="marca-sys">Sys</span>
              </span>
            </Link>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}

export function BarraGestion({
  usuario,
  children,
}: {
  usuario: UsuarioGestion;
  children: React.ReactNode;
}) {
  if (usuario.rol_usuario !== "Gerente") {
    return <ShellClasico usuario={usuario}>{children}</ShellClasico>;
  }
  return <ShellGerente usuario={usuario}>{children}</ShellGerente>;
}
