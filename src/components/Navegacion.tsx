"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { puedeAcceder, type Rol } from "@/lib/auth/permisos";

// Links del menú, en el orden de uso diario. Solo UX: el bloqueo real está en
// páginas, server actions y fn_* de la base.
// "Otorgar turno" arranca en /turnos/nuevo (HU-28, paso 1: elegir el paciente).
export const LINKS_MENU = [
  { href: "/", texto: "Inicio" },
  { href: "/turnos/nuevo", texto: "Otorgar turno" },
  { href: "/agenda", texto: "Agenda" },
  { href: "/turnos", texto: "Turnos" }, // HU-09: buscar y filtrar
  { href: "/pagos", texto: "Pagos" }, // HU-14: listado de cobros
  { href: "/mi-agenda", texto: "Mi agenda" }, // HU-12: solo Profesional
  { href: "/pacientes", texto: "Pacientes" },
  { href: "/profesionales", texto: "Profesionales" },
  { href: "/usuarios", texto: "Personal interno" }, // HU-29: Gerente y Mesa de Entradas
  { href: "/servicios", texto: "Servicios" },
  { href: "/indicadores", texto: "Indicadores" }, // HU-26: solo Gerente
];

// La sección activa: "/" solo en Inicio; el resto también en sus subrutas.
// Los pasos 2 y 3 de otorgar (/disponibilidad) cuentan como "Otorgar turno".
// "Turnos" (HU-09) cubre /turnos y /turnos/[id], pero no /turnos/nuevo (es "Otorgar turno").
function estaActivo(href: string, ruta: string) {
  if (href === "/") return ruta === "/";
  if (href === "/turnos/nuevo" && ruta.startsWith("/disponibilidad")) return true;
  if (href === "/turnos" && ruta.startsWith("/turnos/nuevo")) return false;
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
