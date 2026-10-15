// HU-23. Lo que devuelven las fn_paciente_* (nada clínico ni de pagos).

export type ObraSocialPortal = {
  id_obra_social: string;
  nombre_obra_social: string;
  numero_afiliado: string;
};

// fn_acceso_paciente
export type PacientePortal = {
  id_paciente: string;
  nombre_paciente: string;
  apellido_paciente: string;
  obras_sociales: ObraSocialPortal[]; // solo las activas
};

// fn_paciente_catalogo
export type ProfesionalPortal = {
  id_profesional: string;
  nombre_profesional: string;
  apellido_profesional: string;
};

export type ServicioPortal = {
  id_servicio: string;
  nombre_servicio: string;
  duracion_minutos: number;
  precio_servicio: number | null;
  profesionales: ProfesionalPortal[];
};

// fn_paciente_horarios
export type HorariosPortal = {
  fecha: string;
  nombre_profesional: string;
  apellido_profesional: string;
  nombre_servicio: string;
  duracion_minutos: number;
  horarios: string[];
  mensaje: string | null;
};

// fn_paciente_turno_json (dentro de sacar, mis turnos y cancelar)
export type TurnoPortal = {
  id_turno: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: "confirmado" | "cancelado" | "ausente" | "atendido";
  origen: "recepcion" | "online";
  id_servicio: string;
  nombre_servicio: string;
  id_profesional: string;
  nombre_profesional: string;
  apellido_profesional: string;
  cobertura: string;
  numero_afiliado: string | null;
  cancelable: boolean;
};

export type MisTurnos = {
  proximos: TurnoPortal[];
  anteriores: TurnoPortal[];
};

export type EstadoAccionPortal = {
  ok: boolean;
  error: string | null;
};
