"use client";

// HU-38 / HU-24B. Mismo mecanismo que el PDF de horarios (HU-27): el navegador imprime
// solo el bloque .solo-impresion y desde ahí se guarda como PDF.
// En el historial (HU-24B) hay varias órdenes en la página: se marca solo la elegida
// (.imprimir-esta) y el CSS de impresión oculta el resto.
export function ImprimirOrdenButton({ idBloque, titulo }: { idBloque: string; titulo: string }) {
  const imprimir = () => {
    const bloque = document.getElementById(idBloque);
    bloque?.classList.add("imprimir-esta");
    document.title = titulo;
    window.print();
    setTimeout(() => {
      bloque?.classList.remove("imprimir-esta");
      document.title = "KineSys";
    }, 1000);
  };

  return (
    <button type="button" className="boton-secundario boton-inline no-imprimir" onClick={imprimir}>
      Imprimir / PDF
    </button>
  );
}
