// HU-13 suma "atendido".
export type EstadoTurno = "confirmado" | "cancelado" | "ausente" | "atendido";

// HU-13: la atención registrada. Solo la recibe el profesional que atendió.
export type Atencion = {
  fecha_atencion: string;
  observaciones: string;
  motivo_consulta: string | null;
  orden_medica: string | null; // HU-24A (null = sin orden)
  registrado_en: string;
  editado_en: string | null;
};

// Lo que devuelve fn_obtener_turno / fn_otorgar_turno.
export type Turno = {
  id_turno: string;
  estado: EstadoTurno;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  id_paciente: string;
  nombre_paciente: string;
  apellido_paciente: string;
  dni_paciente: number;
  // HU-12: para que el profesional identifique y atienda al paciente.
  fecha_nacimiento_paciente: string | null;
  telefono_paciente: string | null;
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
  // HU-10B: confirmado, sin atención y ya terminó / está ausente (se puede volver atrás).
  marcable_ausente: boolean;
  ausencia_corregible: boolean;
  // HU-10C: confirmado y todavía no empezó.
  reprogramable: boolean;
  // HU-13: confirmado y del día (se le puede registrar la atención).
  atendible: boolean;
  atencion: Atencion | null;
};

export type EstadoOtorgar = {
  ok: boolean;
  error: string | null;
};

export type EstadoCancelar = {
  ok: boolean;
  error: string | null;
};

// HU-09: una fila del listado de turnos (fn_buscar_turnos).
export type TurnoListado = {
  id_turno: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoTurno;
  motivo_cancelacion: string | null;
  id_paciente: string;
  nombre_paciente: string;
  apellido_paciente: string;
  dni_paciente: number;
  id_profesional: string;
  nombre_profesional: string;
  apellido_profesional: string;
  id_servicio: string;
  nombre_servicio: string;
};

export type ResultadoBusquedaTurnos = {
  total: number;
  pagina: number;
  por_pagina: number;
  turnos: TurnoListado[];
};

// HU-10B (marcar / corregir ausencia) y HU-10C (reprogramar).
export type EstadoAccionTurno = {
  ok: boolean;
  error: string | null;
};

// HU-25: una fila del preview (fn_turno_repetir_preview).
export type FechaRepeticion = {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  disponible: boolean;
  motivo: string | null; // null si está disponible
};

// HU-25: lo que devuelve fn_turno_repetir_confirmar.
export type ResultadoRepeticion = {
  id_serie: string | null; // null si no se creó ningún turno
  creados: { id_turno: string; fecha: string }[];
  omitidos: { fecha: string; motivo: string }[];
};

export type EstadoPreviaRepetir = {
  error: string | null;
  semanas: string; // las semanas del preview que se está mostrando
  fechas: FechaRepeticion[] | null;
};

export type EstadoConfirmarRepetir = {
  error: string | null;
  resultado: ResultadoRepeticion | null;
};
