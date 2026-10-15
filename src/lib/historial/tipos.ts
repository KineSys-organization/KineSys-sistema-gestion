// HU-16: lo que devuelve fn_consultar_historial_paciente.

export type ResumenHistorial = {
  total: number;
  atendidos: number;
  ausentes: number;
  cancelados: number;
  confirmados: number;
};

export type AtencionHistorial = {
  motivo_consulta: string | null;
  observaciones: string;
  orden_medica: string | null;
};

export type TurnoHistorial = {
  id_turno: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  motivo_cancelacion: string | null;
  detalle_cancelacion: string | null;
  id_profesional: string;
  nombre_profesional: string;
  apellido_profesional: string;
  nombre_servicio: string;
  cobertura: string;
  estado_cobro: string | null;
  importe_final: number | null;
  medio_pago: string | null;
  tiene_orden_medica: boolean | null;
  atencion: AtencionHistorial | null;
};

export type ProfesionalHistorial = {
  id_profesional: string;
  nombre: string;
  apellido: string;
  activo: boolean;
};

export type HistorialPaciente = {
  paciente: {
    id_paciente: string;
    nombre_paciente: string;
    apellido_paciente: string;
    dni_paciente: number;
  };
  vista: "administrativa" | "clinica";
  resumen: ResumenHistorial;
  total: number;
  pagina: number;
  por_pagina: number;
  turnos: TurnoHistorial[];
  profesionales: ProfesionalHistorial[];
};

export type FiltrosHistorial = {
  desde: string | null;
  hasta: string | null;
  profesional: string | null;
  pagina: number;
};
