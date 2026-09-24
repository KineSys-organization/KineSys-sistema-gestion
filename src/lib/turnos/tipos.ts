// Lo que devuelve fn_obtener_turno / fn_otorgar_turno.
export type Turno = {
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
  nombre_profesional: string;
  apellido_profesional: string;
  id_servicio: string;
  nombre_servicio: string;
  id_obra_social: string | null;
  cobertura: string;
  numero_afiliado: string | null;
  // HU-10A: datos de la cancelación (null si no está cancelado).
  motivo_cancelacion: string | null;
  detalle_cancelacion: string | null;
  cancelado_en: string | null;
  // Confirmado y todavía no pasó (lo calcula la base con la hora de Argentina).
  cancelable: boolean;
};

export type EstadoOtorgar = {
  ok: boolean;
  error: string | null;
};

export type EstadoCancelar = {
  ok: boolean;
  error: string | null;
};
