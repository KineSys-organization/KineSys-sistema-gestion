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
}: {
  desde: string;
  hasta: string;
}) {
  const [desde, setDesde] = useState(desdeInicial);
  const [hasta, setHasta] = useState(hastaInicial);
  const inputHasta = useRef<HTMLInputElement>(null);
  const invalido = desde !== "" && hasta !== "" && hasta < desde;

  useEffect(() => {
    inputHasta.current?.setCustomValidity(invalido ? MENSAJE_RANGO_INVALIDO : "");
  }, [invalido]);

  return (
    <>
      <div className="campo">
        <label htmlFor="desde">Desde</label>
        <input
          id="desde"
          name="desde"
          type="date"
          value={desde}
          max={hasta || undefined}
          onChange={(e) => setDesde(e.target.value)}
        />
      </div>
      <div className="campo">
        <label htmlFor="hasta">Hasta</label>
        <input
          ref={inputHasta}
          id="hasta"
          name="hasta"
          type="date"
          value={hasta}
          min={desde || undefined}
          aria-invalid={invalido || undefined}
          aria-describedby={invalido ? "rango-error" : undefined}
          onChange={(e) => setHasta(e.target.value)}
        />
      </div>
      {invalido && (
        <p id="rango-error" className="mensaje-error campo-ancho" role="alert">
          {MENSAJE_RANGO_INVALIDO}. Corregí el rango.
        </p>
      )}
    </>
  );
}
