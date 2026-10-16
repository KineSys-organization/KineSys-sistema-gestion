// HU-19. Ayudas para mostrar los indicadores económicos (sin Supabase ni Next, para `npm test`).
// Los cálculos (sumas, período anterior, variación) los hace la base:
// fn_consultar_indicadores_economicos. Acá solo se arma el texto y el ancho de las barras.

export const SIN_DATOS_PARA_COMPARAR = "Sin datos para comparar";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type Tendencia = "sube" | "baja" | "igual" | "sin_datos";

// Variación contra el período anterior. El % llega null si el anterior fue 0 (la base no divide
// por cero): en ese caso se muestra "Sin datos para comparar".
export function describirVariacion(
  pesos: number,
  porcentaje: number | null
): { tendencia: Tendencia; porcentaje: string } {
  if (porcentaje === null || porcentaje === undefined) {
    return { tendencia: "sin_datos", porcentaje: SIN_DATOS_PARA_COMPARAR };
  }
  const tendencia: Tendencia = pesos > 0 ? "sube" : pesos < 0 ? "baja" : "igual";
  const signo = porcentaje > 0 ? "+" : "";
  const texto = `${signo}${porcentaje.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;
  return { tendencia, porcentaje: texto };
}

// "2026-05" -> "may 2026".
export function nombreMes(mes: string): string {
  const [anio, numero] = mes.split("-").map(Number);
  return `${MESES[(numero ?? 1) - 1] ?? mes} ${anio}`;
}

// Ancho de la barra (0..100 %) respecto del mayor valor. Netos negativos (más reembolsos
// que cobros) quedan en 0: el importe se muestra igual al lado.
export function anchoBarra(valor: number, maximo: number): number {
  if (!(maximo > 0) || !(valor > 0)) return 0;
  return Math.round((Math.min(valor, maximo) / maximo) * 100);
}
