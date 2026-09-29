"use client";

import { useRouter } from "next/navigation";
import type { Profesional } from "@/lib/profesionales/tipos";
import { urlPasoHorario } from "@/lib/turnos/flujo";

// Paso 2 de otorgar turno (HU-28): profesional y servicio. Al cambiar cualquiera se
// actualiza la URL (sin perder al paciente) y el calendario se recalcula (sin botón "Consultar").
// Es cliente solo porque el servicio depende del profesional elegido.
export function SelectorProfesionalServicio({
  paciente,
  profesionales,
  profesional,
  servicio,
}: {
  paciente: string;
  profesionales: Profesional[];
  profesional: string;
  servicio: string;
}) {
  const router = useRouter();
  const servicios =
    profesionales.find((p) => p.id_usuario === profesional)?.servicios ?? [];

  function cambiarProfesional(id: string) {
    // Al cambiar de profesional arranca con su primer servicio.
    const primero =
      profesionales.find((p) => p.id_usuario === id)?.servicios?.[0]?.id_servicio ?? "";
    router.push(urlPasoHorario({ paciente, profesional: id, servicio: primero }));
  }

  return (
    <div className="selector-turno">
      <div className="campo">
        <label htmlFor="profesional">Profesional</label>
        <select
          id="profesional"
          value={profesional}
          onChange={(e) => cambiarProfesional(e.target.value)}
        >
          {profesionales.map((p) => (
            <option key={p.id_usuario} value={p.id_usuario}>
              {p.apellido_usuario}, {p.nombre_usuario}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="servicio">Servicio</label>
        <select
          id="servicio"
          value={servicio}
          onChange={(e) =>
            router.push(urlPasoHorario({ paciente, profesional, servicio: e.target.value }))
          }
        >
          {servicios.map((s) => (
            <option key={s.id_servicio} value={s.id_servicio}>
              {s.nombre_servicio}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
