"use client";

import { useEffect } from "react";

// HU-35. "Descargar PDF": igual que el PDF de horarios (HU-27), usa la impresión del navegador
// ("Guardar como PDF"). El título de la ventana es el nombre sugerido del archivo.
// Con autoImprimir (link "Descargar PDF" desde el pago) abre el diálogo al entrar.
export function DescargarComprobanteButton({
  titulo,
  autoImprimir = false,
}: {
  titulo: string; // "Comprobante 0000123 - Pérez, Juan"
  autoImprimir?: boolean;
}) {
  function imprimir() {
    const anterior = document.title;
    document.title = titulo;
    window.print();
    setTimeout(() => {
      document.title = anterior;
    }, 1000);
  }

  useEffect(() => {
    // Solo al entrar a la página (por eso la lista de dependencias va vacía).
    if (autoImprimir) imprimir();
  }, []);

  return (
    <button type="button" className="boton-principal boton-inline no-imprimir" onClick={imprimir}>
      Descargar PDF
    </button>
  );
}
