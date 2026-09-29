"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { puedeAcceder, type Rol } from "@/lib/auth/permisos";

// Links del menú, en el orden de uso diario. Solo UX: el bloqueo real está en
// páginas, server actions y fn_* de la base.
// "Otorgar turno" arranca en /disponibilidad (paso 1: elegir el horario).
export const LINKS_MENU = [
  { href: "/", texto: "Inicio" },
  { href: "/disponibilidad", texto: "Otorgar turno" },
  { href: "/agenda", texto: "Agenda" },
  { href: "/turnos", texto: "Turnos" }, // HU-09: buscar y filtrar
  { href: "/mi-agenda", texto: "Mi agenda" }, // HU-12: solo Profesional
  { href: "/pacientes", texto: "Pacientes" },
  { href: "/profesionales", texto: "Profesionales" },
  { href: "/servicios", texto: "Servicios" },
];

// La sección activa: "/" solo en Inicio; el resto también en sus subrutas.
// El paso 2 de otorgar (/turnos/nuevo) cuenta como "Otorgar turno", no como "Turnos".
function estaActivo(href: string, ruta: string) {
  if (href === "/") return ruta === "/";
  const otorgando = ruta.startsWith("/turnos/nuevo");
  if (href === "/disponibilidad" && otorgando) return true;
  if (href === "/turnos" && otorgando) return false;
  return ruta === href || ruta.startsWith(href + "/");
}

// Cliente solo para saber la ruta actual y marcar el link activo.
export function Navegacion({ rol }: { rol: Rol }) {
  const ruta = usePathname();
  const nav = useRef<HTMLElement>(null);

  // En pantallas angostas el menú se desliza: que la sección activa quede a la vista.
  useEffect(() => {
    nav.current
      ?.querySelector("a.activo")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [ruta]);

  return (
    <nav className="nav-app" aria-label="Principal" ref={nav}>
      {LINKS_MENU.filter((link) => puedeAcceder(rol, link.href)).map((link) => {
        const activo = estaActivo(link.href, ruta);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={activo ? "activo" : undefined}
            aria-current={activo ? "page" : undefined}
          >
            {link.texto}
          </Link>
        );
      })}
    </nav>
  );
}
