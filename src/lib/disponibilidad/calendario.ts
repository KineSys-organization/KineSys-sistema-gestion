// Calendario de disponibilidad (paso 1 de otorgar turno).
// Lógica pura (sin Supabase ni Next) para poder testearla con `npm test`.

// Lo que devuelve fn_consultar_disponibilidad_calendario.
export type DiaCalendario = { fecha: string; libres: number };

export type CalendarioDisponibilidad = {
  desde: string;
  hasta: string;
  nombre_profesional: string;
  apellido_profesional: string;
  nombre_servicio: string;
  duracion_minutos: number;
  dias: DiaCalendario[];
};

// Una celda del calendario. null = día fuera de la ventana de 30 días (celda vacía).
export type CeldaCalendario = {
  fecha: string;
  dia: number;
  mes: string; // "sep" (se muestra en el día 1 y en el primer día de la ventana)
  libres: number;
  esPrimeroDelMes: boolean;
} | null;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Arma las semanas (lunes a domingo) que cubren la ventana desde..hasta.
// Los días de la semana que quedan fuera de la ventana van como null.
export function armarSemanas(dias: DiaCalendario[]): CeldaCalendario[][] {
  if (dias.length === 0) return [];

  const celdas: CeldaCalendario[] = [];
  // getUTCDay: 0 = domingo. Lo paso a lunes = 0.
  const primerDia = new Date(`${dias[0].fecha}T00:00:00Z`);
  const huecoInicial = (primerDia.getUTCDay() + 6) % 7;
  for (let i = 0; i < huecoInicial; i++) celdas.push(null);

  dias.forEach((d, i) => {
    const fecha = new Date(`${d.fecha}T00:00:00Z`);
    celdas.push({
      fecha: d.fecha,
      dia: fecha.getUTCDate(),
      mes: MESES[fecha.getUTCMonth()],
      libres: d.libres,
      esPrimeroDelMes: i === 0 || fecha.getUTCDate() === 1,
    });
  });

  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas: CeldaCalendario[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

// El día que se muestra seleccionado: el pedido si está en la ventana;
// si no, el primero con horarios libres (así se ven horarios sin hacer otro click).
export function diaSeleccionado(dias: DiaCalendario[], pedido: string): string | null {
  if (dias.some((d) => d.fecha === pedido)) return pedido;
  return dias.find((d) => d.libres > 0)?.fecha ?? null;
}

// URL de /disponibilidad conservando la consulta (para volver sin perder lo elegido).
export function urlDisponibilidad(campos: {
  profesional?: string;
  servicio?: string;
  fecha?: string;
}): string {
  const params = new URLSearchParams();
  if (campos.profesional) params.set("profesional", campos.profesional);
  if (campos.servicio) params.set("servicio", campos.servicio);
  if (campos.fecha) params.set("fecha", campos.fecha);
  const query = params.toString();
  return query ? `/disponibilidad?${query}` : "/disponibilidad";
}
