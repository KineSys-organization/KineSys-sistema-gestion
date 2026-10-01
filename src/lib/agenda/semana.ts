import { sumarDias } from "@/lib/atencion/validar";

export function obtenerDiasSemana(fecha: string): string[] {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  const lunes = sumarDias(fecha, -((dia + 6) % 7));
  return Array.from({ length: 7 }, (_, indice) => sumarDias(lunes, indice));
}
