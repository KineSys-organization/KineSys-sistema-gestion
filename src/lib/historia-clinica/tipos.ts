// HU-39: lo que devuelve fn_obtener_historia_clinica.

// Los seis textos de la ficha clínica (todos opcionales).
export type CamposFicha = {
  antecedentes_personales: string | null;
  antecedentes_quirurgicos: string | null;
  alergias: string | null;
  medicacion_actual: string | null;
  diagnostico: string | null;
  observaciones_generales: string | null;
};

export type FichaClinica = CamposFicha & {
  creado_en: string;
  modificado_en: string;
  modificado_por: string; // "Nombre Apellido"
};

// Versión anterior: quién y cuándo la había escrito, y cuándo quedó reemplazada.
export type VersionFicha = CamposFicha & {
  modificado_en: string;
  modificado_por: string;
  reemplazada_en: string;
};

// Evolución: una atención registrada (HU-13 + orden médica de HU-24A).
export type AtencionEvolucion = {
  id_turno: string;
  fecha_atencion: string;
  hora_inicio: string;
  profesional: string; // "Apellido, Nombre"
  nombre_servicio: string;
  motivo_consulta: string | null;
  observaciones: string;
  orden_medica: string | null;
};

export type HistoriaClinica = {
  paciente: {
    id_paciente: string;
    nombre_paciente: string;
    apellido_paciente: string;
    dni_paciente: number;
    fecha_nacimiento_paciente: string | null;
    telefono_paciente: string | null;
  };
  ficha: FichaClinica | null; // null = todavía no se cargó
  versiones: VersionFicha[];
  evolucion: AtencionEvolucion[];
};

export type EstadoHistoria = {
  ok: boolean;
  error: string | null;
};
