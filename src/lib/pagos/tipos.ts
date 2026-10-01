// HU-14. Lo que devuelven fn_obtener_pago, fn_registrar_pago, fn_corregir_pago y fn_listar_pagos.
// Los importes llegan como number (numeric de la base, en pesos).
import type { EstadoTurno } from "@/lib/turnos/tipos";

export type TurnoParaPago = {
  id_turno: string;
  estado: EstadoTurno;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  id_paciente: string;
  nombre_paciente: string;
  apellido_paciente: string;
  dni_paciente: number;
  nombre_profesional: string;
  apellido_profesional: string;
  nombre_servicio: string;
  precio_servicio: number | null; // precio actual del servicio (sugerencia)
  id_obra_social: string | null; // null = Particular
  cobertura: string;
  numero_afiliado: string | null;
};

export type Pago = {
  id_pago: string;
  importe_base: number;
  descuento: number;
  importe_final: number;
  medio_pago: string;
  registrado_en: string;
  registrado_por: string;
  corregido_en: string | null;
};

export type CorreccionPago = {
  motivo: string;
  importe_base_anterior: number;
  descuento_anterior: number;
  importe_final_anterior: number;
  medio_pago_anterior: string;
  importe_base_nuevo: number;
  descuento_nuevo: number;
  importe_final_nuevo: number;
  medio_pago_nuevo: string;
  corregido_en: string;
  corregido_por: string;
};

export type DetallePago = {
  turno: TurnoParaPago;
  cobrable: boolean; // confirmado o atendido y sin pago
  pago: Pago | null;
  correcciones: CorreccionPago[];
};

export type PagoListado = {
  id_pago: string;
  id_turno: string;
  nombre_paciente: string;
  apellido_paciente: string;
  dni_paciente: number;
  fecha_turno: string;
  hora_turno: string;
  estado_turno: EstadoTurno;
  nombre_servicio: string;
  importe_base: number;
  descuento: number;
  importe_final: number;
  medio_pago: string;
  registrado_en: string;
  corregido: boolean;
};

export type ResultadoPagos = {
  total: number;
  pagina: number;
  por_pagina: number;
  pagos: PagoListado[];
};

export type EstadoPago = {
  ok: boolean;
  error: string | null;
};
