export const DIAS_SEMANA = [
  "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
] as const;

export type FranjaProfesional = {
  id_franja: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
};

export type HorariosProfesional = {
  nombre_usuario: string;
  apellido_usuario: string;
  tiene_servicios: boolean;
  habilitado_turnos: boolean;
  franjas: FranjaProfesional[];
};

export type CamposFranja = {
  dia_semana: string;
  hora_inicio: string;
  hora_fin: string;
};

export type TurnoAfectado = {
  id_turno: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  paciente: string;
  dni_paciente: number | null;
  servicio: string;
  estado: string;
};

export type EstadoFranja = {
  ok: boolean;
  error: string | null;
  campos?: CamposFranja;
  turnos?: TurnoAfectado[];
  requiereConfirmacion?: boolean;
};

export function esIdProfesional(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const HORA_OK = /^([01]\d|2[0-3]):[0-5]\d$/;

// Solo formato; las reglas de negocio se validan en Supabase.
export function validarCamposFranja(campos: CamposFranja): string | null {
  if (!/^[1-7]$/.test(campos.dia_semana)) return "Seleccioná un día de la semana";
  if (!HORA_OK.test(campos.hora_inicio) || !HORA_OK.test(campos.hora_fin)) {
    return "Ingresá la hora de inicio y la hora de fin con formato HH:MM";
  }
  return null;
}

// Alta en varios días a la vez (migración 012): la misma franja para cada día marcado.
export type CamposFranjas = {
  dias: string[];
  hora_inicio: string;
  hora_fin: string;
};

// Atajos del formulario de alta (1 = lunes ... 7 = domingo).
export const DIAS_LUNES_A_VIERNES = [1, 2, 3, 4, 5];
export const DIAS_TODOS = [1, 2, 3, 4, 5, 6, 7];

export function validarCamposFranjas(campos: CamposFranjas): string | null {
  if (campos.dias.length === 0) return "Seleccioná al menos un día de la semana";
  if (campos.dias.some((dia) => !/^[1-7]$/.test(dia))) return "Seleccioná un día de la semana válido";
  if (!HORA_OK.test(campos.hora_inicio) || !HORA_OK.test(campos.hora_fin)) {
    return "Ingresá la hora de inicio y la hora de fin con formato HH:MM";
  }
  return null;
}

