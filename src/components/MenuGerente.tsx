"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { estaActivo } from "@/components/Navegacion";

const ATENCION = [
  { href: "/turnos/nuevo", texto: "Otorgar turno" },
  { href: "/agenda", texto: "Agenda" },
  { href: "/turnos", texto: "Turnos" },
  { href: "/pagos", texto: "Pagos" },
];

const INFORMACION = [
  { href: "/profesionales", texto: "Profesionales" },
  { href: "/pacientes", texto: "Pacientes" },
  { href: "/obras-sociales", texto: "Obras sociales" },
  { href: "/servicios", texto: "Servicios" },
];

export function MenuGerente({ colapsado }: { colapsado: boolean }) {
  const ruta = usePathname();
  const atencionActiva = ATENCION.some((item) => estaActivo(item.href, ruta));
  const infoActiva = INFORMACION.some((item) => estaActivo(item.href, ruta));
  const [abiertoAtencion, setAbiertoAtencion] = useState(true);
  const [abiertoInfo, setAbiertoInfo] = useState(true);

  useEffect(() => {
    if (atencionActiva) setAbiertoAtencion(true);
    if (infoActiva) setAbiertoInfo(true);
  }, [atencionActiva, infoActiva]);

  if (colapsado) return null;

  return (
    <nav className="menu-gerente" aria-label="Principal">
      <Link
        href="/indicadores"
        className={estaActivo("/indicadores", ruta) ? "activo" : undefined}
        aria-current={estaActivo("/indicadores", ruta) ? "page" : undefined}
      >
        Indicadores
      </Link>

      <Grupo
        titulo="Atención"
        abierto={abiertoAtencion}
        activo={atencionActiva}
        onToggle={() => setAbiertoAtencion((v) => !v)}
        items={ATENCION}
        ruta={ruta}
      />
      <Grupo
        titulo="Información"
        abierto={abiertoInfo}
        activo={infoActiva}
        onToggle={() => setAbiertoInfo((v) => !v)}
        items={INFORMACION}
        ruta={ruta}
      />

      <p className="menu-gerente-seccion">Equipo</p>
      <Link
        href="/usuarios"
        className={estaActivo("/usuarios", ruta) ? "activo" : undefined}
        aria-current={estaActivo("/usuarios", ruta) ? "page" : undefined}
      >
        Personal interno
      </Link>
    </nav>
  );
}

function Grupo({
  titulo,
  abierto,
  activo,
  onToggle,
  items,
  ruta,
}: {
  titulo: string;
  abierto: boolean;
  activo: boolean;
  onToggle: () => void;
  items: { href: string; texto: string }[];
  ruta: string;
}) {
  return (
    <div className="menu-grupo">
      <button
        type="button"
        className={`menu-grupo-btn${activo ? " activo-grupo" : ""}`}
        aria-expanded={abierto}
        onClick={onToggle}
      >
        <span>{titulo}</span>
        <span aria-hidden>{abierto ? "▾" : "▸"}</span>
      </button>
      {abierto && (
        <div className="menu-sub">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={estaActivo(item.href, ruta) ? "activo" : undefined}
              aria-current={estaActivo(item.href, ruta) ? "page" : undefined}
            >
              {item.texto}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
