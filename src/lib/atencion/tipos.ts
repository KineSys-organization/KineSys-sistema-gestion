import type { TurnoAgenda } from "@/lib/agenda/tipos";

// HU-12: la agenda del profesional logueado para una fecha.
export type MiAgenda = {
  fecha: string;
  turnos: TurnoAgenda[];
};

// HU-13: resultado de registrar o editar la atención (el formulario muestra el error).
export type EstadoAtencion = {
  ok: boolean;
  error: string | null;
};
