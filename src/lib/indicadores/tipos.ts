// HU-26. Lo que devuelve fn_consultar_indicadores_generales.

export type OcupacionProfesional = {
  id_profesional: string;
  nombre_profesional: string;
  apellido_profesional: string;
  turnos: number; // todos los turnos del período, cualquier estado
  minutos_disponibles: number;
  minutos_ocupados: number;
  porcentaje: number;
};

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
  ocupacion: {
    minutos_disponibles: number;
    minutos_ocupados: number;
    porcentaje: number;
  };
  profesionales: OcupacionProfesional[];
  pacientes_nuevos: number;
};

export type EstadoIndicadores = {
  ok: boolean;
  error: string | null;
  data: IndicadoresGenerales | null;
};
