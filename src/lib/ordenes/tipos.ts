// HU-24B. Lo que devuelve fn_listar_ordenes_paciente.

export type OrdenHistorial = {
  id_atencion: string;
  id_turno: string;
  fecha: string;
  hora_inicio: string;
  id_profesional: string;
  nombre_profesional: string;
  apellido_profesional: string;
  matricula_profesional: string | null;
  nombre_servicio: string;
  cobertura: string;
  numero_afiliado: string | null;
  orden_sesiones: number | null; // null = orden de HU-24A (sesiones no informadas)
  orden_medica: string; // detalle
  registrado_en: string;
  editado_en: string | null;
};

export type HistorialOrdenes = {
  paciente: {
    id_paciente: string;
    nombre_paciente: string;
    apellido_paciente: string;
    dni_paciente: number;
  };
  profesionales: {
    id_profesional: string;
    nombre_profesional: string;
    apellido_profesional: string;
  }[];
  total_sin_filtros: number;
  ordenes: OrdenHistorial[];
};
