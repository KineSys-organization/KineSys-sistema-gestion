export type ServicioProfesional = {
  id_servicio: string;
  nombre_servicio: string;
};

export type Profesional = {
  id_usuario: string;
  nombre_usuario: string;
  apellido_usuario: string;
  dni_usuario: number;
  telefono_usuario: string;
  mail_usuario: string;
  matricula: string;
  activo: boolean;
  servicios: ServicioProfesional[];
};

export type EstadoFormulario = {
  error: string | null;
  ok: boolean;
  confirmacion?: string;
  datosConfirmacion?: string;
};

export type DetalleProfesionalEdicion = {
  id_usuario: string;
  nombre_usuario: string;
  apellido_usuario: string;
  fecha_nacimiento_usuario: string;
  dni_usuario: number;
  telefono_usuario: string;
  mail_usuario: string;
  matricula: string;
  activo: boolean;
  servicios: string[];
};
