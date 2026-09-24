import Link from "next/link";
import { puedeAcceder, type Rol } from "@/lib/auth/permisos";

// Links del menú. Solo UX: el bloqueo real está en páginas, server actions y fn_* de la base.
export const LINKS_MENU = [
  { href: "/", texto: "Inicio" },
  { href: "/pacientes", texto: "Pacientes" },
  { href: "/disponibilidad", texto: "Disponibilidad" },
  { href: "/agenda", texto: "Agenda" },
  { href: "/mi-agenda", texto: "Mi agenda" }, // HU-12: solo Profesional
  { href: "/profesionales", texto: "Profesionales" },
  { href: "/servicios", texto: "Servicios" },
];

export function Navegacion({ rol }: { rol: Rol }) {
  return (
    <nav className="nav-app">
      {LINKS_MENU.filter((link) => puedeAcceder(rol, link.href)).map((link) => (
        <Link key={link.href} href={link.href}>
          {link.texto}
        </Link>
      ))}
    </nav>
  );
}
