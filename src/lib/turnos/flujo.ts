// HU-28. Otorgar turno empezando por el paciente.
// Orden: 1 Paciente → 2 Servicio y profesional → 3 Fecha y horario → 4 Cobertura → 5 Confirmar.
//
//   /turnos/nuevo                         → paso 1 (buscar o registrar al paciente)
//   /disponibilidad?paciente=...          → pasos 2 y 3 (profesional, servicio y calendario)
//   /turnos/nuevo?paciente=...&...&hora=  → pasos 4 y 5 (cobertura y confirmar)
//
// Lógica pura (sin Supabase ni Next) para poder testearla con `npm test`.
// Cada link del flujo se arma acá, así ninguno pierde al paciente elegido.

export type DatosFlujo = {
  paciente?: string;
  profesional?: string;
  servicio?: string;
  fecha?: string;
  hora?: string;
};

export const PASOS_TURNO = [
  "Paciente",
  "Servicio y profesional",
  "Fecha y horario",
  "Cobertura",
  "Confirmar",
] as const;

export type NumeroPaso = 1 | 2 | 3 | 4 | 5;

// Arma "ruta?clave=valor" solo con las claves que tienen valor, en el orden pedido.
function armarUrl(ruta: string, datos: DatosFlujo, claves: (keyof DatosFlujo)[]): string {
  const params = new URLSearchParams();
  for (const clave of claves) {
    const valor = datos[clave]?.trim();
    if (valor) params.set(clave, valor);
  }
  const query = params.toString();
  return query ? `${ruta}?${query}` : ruta;
}

// Paso 1. Sin paciente; conserva profesional, servicio y fecha si ya venían elegidos
// (por ejemplo desde la Agenda o desde "Cambiar paciente").
export function urlPasoPaciente(datos: DatosFlujo = {}): string {
  return armarUrl("/turnos/nuevo", datos, ["profesional", "servicio", "fecha"]);
}

// Pasos 2 y 3. Siempre con el paciente; sin hora (la hora se elige en este paso).
export function urlPasoHorario(datos: DatosFlujo): string {
  return armarUrl("/disponibilidad", datos, ["paciente", "profesional", "servicio", "fecha"]);
}

// Pasos 4 y 5. Con todo lo elegido.
export function urlPasoConfirmar(datos: DatosFlujo): string {
  return armarUrl("/turnos/nuevo", datos, ["paciente", "profesional", "servicio", "fecha", "hora"]);
}

// ¿Está todo lo del horario? (profesional, servicio, fecha y hora)
export function tieneHorario(datos: DatosFlujo): boolean {
  return Boolean(
    datos.profesional?.trim() && datos.servicio?.trim() && datos.fecha?.trim() && datos.hora?.trim()
  );
}
