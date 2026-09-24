export type TurnoAgenda = {
  id_turno: string;
  estado: "confirmado" | "cancelado" | "ausente";
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  id_paciente: string;
  nombre_paciente: string;
  apellido_paciente: string;
  dni_paciente: number;
  id_profesional: string;
  id_servicio: string;
  nombre_servicio: string;
  motivo_cancelacion: string | null; // HU-10A
};

export type Agenda = {
  id_profesional: string;
  fecha: string;
  turnos: TurnoAgenda[];
};

export type EstadoAgenda = {
  ok: boolean;
  error: string | null;
  data: Agenda | null;
};
