"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { puedeAcceder, type Rol } from "@/lib/auth/permisos";

// Links del menú clásico (Mesa de Entradas y Profesional).
// "Otorgar turno" arranca en /turnos/nuevo (HU-28, paso 1: elegir el paciente).
export const LINKS_MENU = [
  { href: "/", texto: "Inicio" },
  { href: "/turnos/nuevo", texto: "Otorgar turno" },
  { href: "/agenda", texto: "Agenda" },
  { href: "/turnos", texto: "Turnos" },
  { href: "/pagos", texto: "Pagos" },
  { href: "/mi-agenda", texto: "Mi agenda" },
  { href: "/pacientes", texto: "Pacientes" },
  { href: "/obras-sociales", texto: "Obras sociales" },
  { href: "/profesionales", texto: "Profesionales" },
  { href: "/usuarios", texto: "Personal interno" },
  { href: "/servicios", texto: "Servicios" },
  { href: "/indicadores", texto: "Indicadores" },
];

export function estaActivo(href: string, ruta: string) {
  if (href === "/") return ruta === "/";
  if (href === "/turnos/nuevo" && ruta.startsWith("/disponibilidad")) return true;
  if (href === "/pagos" && /\/turnos\/[^/]+\/pago/.test(ruta)) return true;
  if (href === "/turnos" && ruta.startsWith("/turnos/nuevo")) return false;
  if (href === "/turnos" && /\/turnos\/[^/]+\/pago/.test(ruta)) return false;
  return ruta === href || ruta.startsWith(href + "/");
}

export function Navegacion({ rol }: { rol: Rol }) {
  const ruta = usePathname();
  const nav = useRef<HTMLElement>(null);

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
