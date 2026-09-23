"use client";

import { useMemo, useState } from "react";
import type { ObraSocial, ObraSocialPaciente } from "@/lib/pacientes/tipos";

type Props = {
  obras: ObraSocial[];
  seleccionadas?: ObraSocialPaciente[];
};

export function ListaObrasSociales({ obras, seleccionadas = [] }: Props) {
  const iniciales = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const obra of seleccionadas) {
      mapa.set(obra.id_obra_social, obra.numero_afiliado);
    }
    return mapa;
  }, [seleccionadas]);

  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(seleccionadas.map((obra) => obra.id_obra_social))
  );
  const [afiliados, setAfiliados] = useState<Record<string, string>>(() => {
    const valores: Record<string, string> = {};
    for (const [id, afiliado] of iniciales.entries()) {
      valores[id] = afiliado;
    }
    return valores;
  });

  function alMarcar(id: string, checked: boolean) {
    setMarcadas((prev) => {
      const siguiente = new Set(prev);
      if (checked) siguiente.add(id);
      else siguiente.delete(id);
      return siguiente;
    });
  }

  if (obras.length === 0) {
    return (
      <p className="texto-suave">
        No hay obras sociales en el catálogo. El paciente se puede guardar como particular.
      </p>
    );
  }

  return (
    <div className="lista-obras">
      <p className="texto-suave">
        Opcional. Sin obra social queda como particular (se elige al otorgar el turno).
      </p>
      {obras.map((obra) => {
        const marcada = marcadas.has(obra.id_obra_social);
        return (
          <div key={obra.id_obra_social} className="obra-item">
            <label className="check-item">
              <input
                type="checkbox"
                name="obra_social"
                value={obra.id_obra_social}
                checked={marcada}
                onChange={(evento) => alMarcar(obra.id_obra_social, evento.target.checked)}
              />
              <span>{obra.nombre_obra_social}</span>
            </label>
            {marcada && (
              <div className="campo campo-afiliado">
                <label htmlFor={`afiliado_${obra.id_obra_social}`}>Nº de afiliado</label>
                <input
                  id={`afiliado_${obra.id_obra_social}`}
                  name={`afiliado_${obra.id_obra_social}`}
                  value={afiliados[obra.id_obra_social] ?? ""}
                  onChange={(evento) =>
                    setAfiliados((prev) => ({
                      ...prev,
                      [obra.id_obra_social]: evento.target.value,
                    }))
                  }
                  required
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
