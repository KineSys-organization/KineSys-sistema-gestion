import { anchoBarra } from "@/lib/indicadores/economicos";
import { formatearPesos } from "@/lib/pagos/validar";

export type BarraGrafico = {
  clave: string;
  etiqueta: string; // abajo de la barra (medio, servicio o profesional)
  importe: number; // en pesos: define la altura
  cantidad: number; // pagos (va en el texto alternativo)
};

// HU-19. Gráfico de barras verticales para comparar importes (medio, servicio, profesional).
// Se despliega con "Ver gráfico": <details> del navegador, sin JavaScript ni librerías.
// La barra más alta es la del mayor importe; las demás, proporcionales. Arriba va el importe
// (texto, no solo el dibujo) y abajo el nombre.
export function GraficoBarras({ titulo, barras }: { titulo: string; barras: BarraGrafico[] }) {
  const maximo = Math.max(0, ...barras.map((b) => Number(b.importe)));

  return (
    <details className="grafico-desplegable">
      <summary className="boton-secundario boton-inline">
        <span className="texto-ver">Ver gráfico</span>
        <span className="texto-ocultar">Ocultar gráfico</span>
      </summary>

      <div className="grafico-barras" role="list" aria-label={titulo}>
        {barras.map((b) => (
          <div
            key={b.clave}
            className="grafico-columna"
            role="listitem"
            aria-label={`${b.etiqueta}: ${formatearPesos(b.importe)} en ${b.cantidad} ${b.cantidad === 1 ? "pago" : "pagos"}`}
          >
            <span className="grafico-valor">{formatearPesos(b.importe)}</span>
            <span className="grafico-pista" aria-hidden="true">
              <span
                className="grafico-relleno"
                style={{ height: `${anchoBarra(Number(b.importe), maximo)}%` }}
              />
            </span>
            <span className="grafico-etiqueta" title={b.etiqueta}>
              {b.etiqueta}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
