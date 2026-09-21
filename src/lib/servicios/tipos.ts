export type Servicio = {
  id_servicio: string;
  nombre_servicio: string;
  duracion_minutos: number;
  granularidad_minutos: number;
  precio_servicio: number | null;
  activo: boolean;
};

export type EstadoFormulario = {
  error: string | null;
  ok: boolean;
};
