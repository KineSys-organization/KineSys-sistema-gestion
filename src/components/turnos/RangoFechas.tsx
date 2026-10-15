"use client";

import { useEffect, useRef, useState } from "react";
import { MENSAJE_RANGO_INVALIDO } from "@/lib/turnos/busqueda";

// HU-09. Desde / Hasta del listado de turnos. Es cliente para impedir un rango al revés
// antes de enviar: Hasta no deja elegir días anteriores a Desde (min) y, si se escribe a
// mano, el navegador bloquea el envío con el mensaje (setCustomValidity).
// La action y la base lo vuelven a validar.
export function RangoFechas({
  desde: desdeInicial,
  hasta: hastaInicial,
  // Prefijo opcional de name/id (p. ej. "h" → hdesde/hhasta) cuando hay dos rangos en la misma página.
  prefijo = "",
}: {
  desde: string;
  hasta: string;
  prefijo?: string;
}) {
  const [desde, setDesde] = useState(desdeInicial);
  const [hasta, setHasta] = useState(hastaInicial);
  const inputHasta = useRef<HTMLInputElement>(null);
  const invalido = desde !== "" && hasta !== "" && hasta < desde;
  const idDesde = `${prefijo}desde`;
  const idHasta = `${prefijo}hasta`;
  const idError = `${prefijo}rango-error`;

  useEffect(() => {
    inputHasta.current?.setCustomValidity(invalido ? MENSAJE_RANGO_INVALIDO : "");
  }, [invalido]);

  return (
    <>
      <div className="campo">
        <label htmlFor={idDesde}>Desde</label>
        <input
          id={idDesde}
          name={idDesde}
          type="date"
          value={desde}
          max={hasta || undefined}
          onChange={(e) => setDesde(e.target.value)}
        />
      </div>
      <div className="campo">
        <label htmlFor={idHasta}>Hasta</label>
        <input
          ref={inputHasta}
          id={idHasta}
          name={idHasta}
          type="date"
          value={hasta}
          min={desde || undefined}
          aria-invalid={invalido || undefined}
          aria-describedby={invalido ? idError : undefined}
          onChange={(e) => setHasta(e.target.value)}
        />
      </div>
      {invalido && (
        <p id={idError} className="mensaje-error campo-ancho" role="alert">
          {MENSAJE_RANGO_INVALIDO}. Corregí el rango.
        </p>
      )}
    </>
  );
}
