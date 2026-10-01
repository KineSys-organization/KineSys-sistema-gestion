import type { EstadoTurno } from "@/lib/turnos/tipos";

// HU-15: un turno del calendario mensual del profesional.
export type TurnoMes = {
  id_turno: string;
  estado: EstadoTurno;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  nombre_paciente: string;
  apellido_paciente: string;
  nombre_servicio: string;
};

// Lo que devuelve fn_consultar_dashboard_profesional.
export type DashboardProfesional = {
  hoy: string;
  dia: { total: number; atendidos: number; pendientes: number };
  semana: { desde: string; hasta: string; cancelaciones: number; ausencias: number };
  mes: { desde: string; hasta: string; turnos: TurnoMes[] };
};
