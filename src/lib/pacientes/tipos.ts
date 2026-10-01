export type ObraSocial = {
  id_obra_social: string;
  nombre_obra_social: string;
  activo?: boolean;
};

export type ObraSocialPaciente = {
  id_obra_social: string;
  nombre_obra_social: string;
  numero_afiliado: string;
  activo?: boolean;
};

export type Paciente = {
  id_paciente: string;
  nombre_paciente: string;
  apellido_paciente: string;
  dni_paciente: number;
  fecha_nacimiento_paciente: string;
  telefono_paciente: string;
  mail_paciente: string;
  obras_sociales: ObraSocialPaciente[];
};

// Fila del listado con filtros (fn_filtrar_pacientes): suma la edad calculada en la base.
export type PacienteListado = Paciente & { edad: number | null };

export type EstadoFormulario = {
  ok: boolean;
  error: string | null;
};
