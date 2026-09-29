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
