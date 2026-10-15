// HU-26. Lo que devuelve fn_consultar_indicadores_generales (vista corta del Incremento 2).

export type IndicadoresGenerales = {
  desde: string;
  hasta: string;
  turnos: {
    total: number;
    confirmados: number;
    atendidos: number;
    cancelados: number;
    ausentes: number;
  };
  pacientes_nuevos: number;
};

export type EstadoIndicadores = {
  ok: boolean;
  error: string | null;
  data: IndicadoresGenerales | null;
};

export type ConteoTurnos = {
  total: number;
  confirmados: number;
  atendidos: number;
  cancelados: number;
  ausentes: number;
};

export type Ocupacion = {
  minutos_ocupados: number | null;
  minutos_disponibles: number | null;
  porcentaje: number | null;
  estado: "calculable" | "sin_franjas" | "inactivo";
};

export type ProfesionalOperativo = ConteoTurnos & {
  id_profesional: string;
  nombre: string;
  apellido: string;
  activo: boolean;
  minutos_ocupados: number | null;
  minutos_disponibles: number | null;
  porcentaje_ocupacion: number | null;
  estado_ocupacion: "calculable" | "sin_franjas" | "inactivo";
};

export type ServicioOperativo = ConteoTurnos & {
  id_servicio: string;
  nombre: string;
  activo: boolean;
};

export type DashboardOperativo = {
  desde: string;
  hasta: string;
  pacientes_nuevos: number;
  pacientes_recurrentes: number;
  ocupacion_centro: Ocupacion;
  profesionales: ProfesionalOperativo[];
  servicios: ServicioOperativo[];
};

export type EstadoDashboardOperativo = {
  ok: boolean;
  error: string | null;
  data: DashboardOperativo | null;
};
