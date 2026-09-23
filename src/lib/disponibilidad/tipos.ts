export type Disponibilidad = {
  fecha: string;
  id_profesional: string;
  nombre_profesional: string;
  apellido_profesional: string;
  id_servicio: string;
  nombre_servicio: string;
  duracion_minutos: number;
  horarios: string[];
  mensaje: string | null;
};

export type EstadoConsulta = {
  ok: boolean;
  error: string | null;
  data: Disponibilidad | null;
};
