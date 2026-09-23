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

// Solo formato; las reglas de negocio se validan en Supabase.
export function validarCamposFranja(campos: CamposFranja): string | null {
  if (!/^[1-7]$/.test(campos.dia_semana)) return "Seleccioná un día de la semana";
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hora.test(campos.hora_inicio) || !hora.test(campos.hora_fin)) {
    return "Ingresá la hora de inicio y la hora de fin con formato HH:MM";
  }
  return null;
}

