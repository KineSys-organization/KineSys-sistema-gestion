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

// HU-19. Lo que devuelve fn_consultar_indicadores_economicos (importes en pesos).
export type IngresosPeriodo = {
  brutos: number;
  reembolsos: number;
  netos: number;
  cantidad_pagos: number;
  cantidad_reembolsos: number;
  promedio: number;
};

export type EvolucionIngresos = {
  netos_anterior: number;
  brutos_anterior: number;
  reembolsos_anterior: number;
  variacion_pesos: number;
  variacion_porcentaje: number | null; // null = anterior en 0 ("Sin datos para comparar")
};

export type ImportePorMedio = { medio: string; importe: number; cantidad: number };

export type IngresosPorCobertura = {
  particular_importe: number;
  particular_cantidad: number;
  obra_social_importe: number;
  obra_social_cantidad: number;
  descuentos: number;
};

export type NetosDelMes = { mes: string; brutos: number; reembolsos: number; netos: number };

export type IngresosPorServicio = { id_servicio: string; nombre: string; importe: number; cantidad: number };

export type IngresosPorProfesional = {
  id_profesional: string;
  nombre: string;
  apellido: string;
  importe: number;
  cantidad: number;
};

export type IndicadoresEconomicos = {
  desde: string;
  hasta: string;
  anterior: { desde: string; hasta: string };
  ingresos: IngresosPeriodo;
  evolucion: EvolucionIngresos;
  por_medio: ImportePorMedio[];
  cobertura: IngresosPorCobertura;
  pendientes_cobro: number;
  meses: NetosDelMes[];
  por_servicio: IngresosPorServicio[];
  por_profesional: IngresosPorProfesional[];
};

export type EstadoIndicadoresEconomicos = {
  ok: boolean;
  error: string | null;
  data: IndicadoresEconomicos | null;
};
