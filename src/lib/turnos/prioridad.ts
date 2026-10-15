// HU-20. Prioridad o urgencia de un turno (lógica pura, sin Supabase ni Next, para `npm test`).
// Es una marca visual para la operación: no cambia el orden, la disponibilidad ni la atención.

export type Prioridad = "normal" | "alta" | "urgente";

export const PRIORIDADES: { valor: Prioridad; etiqueta: string }[] = [
  { valor: "normal", etiqueta: "Normal" },
  { valor: "alta", etiqueta: "Alta" },
  { valor: "urgente", etiqueta: "Urgente" },
];

export const PRIORIDAD_POR_DEFECTO: Prioridad = "normal";
export const LARGO_MAXIMO_NOTA_PRIORIDAD = 200; // check turno_prioridad_nota_largo (027)

export function esPrioridad(valor: string | null | undefined): valor is Prioridad {
  return PRIORIDADES.some((p) => p.valor === valor);
}

// Lo que no se reconoce (o un turno viejo sin el dato) se trata como Normal.
export function leerPrioridad(valor: string | null | undefined): Prioridad {
  const limpio = (valor ?? "").trim().toLowerCase();
  return esPrioridad(limpio) ? limpio : PRIORIDAD_POR_DEFECTO;
}

export function etiquetaPrioridad(valor: string | null | undefined): string {
  const prioridad = leerPrioridad(valor);
  return PRIORIDADES.find((p) => p.valor === prioridad)?.etiqueta ?? "Normal";
}

// Normal no lleva marca, para no recargar la agenda.
export function muestraMarcaPrioridad(valor: string | null | undefined): boolean {
  return leerPrioridad(valor) !== "normal";
}

export type CamposPrioridad = {
  idTurno: string;
  prioridad: string;
  nota: string;
};

const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Mismos mensajes que fn_cambiar_prioridad_turno.
export function validarCambioPrioridad(input: CamposPrioridad): string | null {
  if (!UUID_OK.test(input.idTurno.trim())) return "Turno inválido";
  if (!input.prioridad.trim()) return "Elegí la prioridad";
  if (!esPrioridad(input.prioridad.trim().toLowerCase())) return "La prioridad no es válida";
  if (input.nota.trim().length > LARGO_MAXIMO_NOTA_PRIORIDAD) {
    return "La nota no puede superar los 200 caracteres";
  }
  return null;
}
