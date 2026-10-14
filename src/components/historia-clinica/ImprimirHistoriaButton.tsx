"use client";

// HU-39 (Should). Mismo mecanismo que el PDF de horarios (HU-27): el navegador imprime
// solo el bloque .solo-impresion de la página y desde ahí se guarda como PDF.
export function ImprimirHistoriaButton({ titulo }: { titulo: string }) {
  const imprimir = () => {
    document.title = titulo;
    window.print();
    setTimeout(() => {
      document.title = "KineSys";
    }, 1000);
  };

  return (
    <button type="button" className="boton-secundario boton-inline no-imprimir" onClick={imprimir}>
      Descargar PDF
    </button>
  );
}
