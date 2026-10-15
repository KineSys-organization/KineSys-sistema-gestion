"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DetallePago, EstadoPago, ResultadoPagos } from "@/lib/pagos/tipos";
import {
  calcularPago,
  centavosATexto,
  esIdTurnoPago,
  validarCorreccion,
  validarFiltrosPagos,
  validarReembolso,
  type CamposPago,
  type FiltrosPagos,
} from "@/lib/pagos/validar";

// La fecha del turno llega como "2026-09-24" o con hora; se deja solo el día.
function normalizarDetalle(detalle: DetallePago): DetallePago {
  return {
    ...detalle,
    turno: { ...detalle.turno, fecha: String(detalle.turno.fecha).slice(0, 10) },
    reembolsable: Boolean(detalle.reembolsable),
    reembolso: detalle.reembolso ?? null,
    correcciones: detalle.correcciones ?? [],
  };
}

function camposDesde(formData: FormData): CamposPago & { idTurno: string } {
  return {
    idTurno: String(formData.get("id_turno") ?? "").trim(),
    importeBase: String(formData.get("importe_base") ?? ""),
    descuento: String(formData.get("descuento") ?? ""),
    medio: String(formData.get("medio_pago") ?? ""),
    // Solo para validar en el front; la base mira la cobertura real del turno.
    conObraSocial: formData.get("con_obra_social") === "si",
  };
}

// El pago se ve en el detalle del turno, en su pantalla de pago y en el listado.
function refrescarPagos(idTurno: string) {
  revalidatePath(`/turnos/${idTurno}`);
  revalidatePath(`/turnos/${idTurno}/pago`);
  revalidatePath("/pagos");
}

// HU-14. Datos para cobrar un turno o ver su pago (con historial de correcciones).
export async function obtenerPagoTurno(idTurno: string): Promise<{
  data: DetallePago | null;
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("pagos.consultar");
  if (sinPermiso) return { data: null, error: sinPermiso };

  if (!esIdTurnoPago(idTurno)) return { data: null, error: "Turno inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_obtener_pago", { p_id_turno: idTurno.trim() });
  if (error) return { data: null, error: error.message };

  return { data: normalizarDetalle(data as DetallePago), error: null };
}

// HU-14. Registrar el cobro. La base bloquea el turno y rechaza un segundo pago.
export async function registrarPago(
  _prev: EstadoPago,
  formData: FormData
): Promise<EstadoPago> {
  const sinPermiso = await exigirAccion("pagos.registrar");
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const campos = camposDesde(formData);
  if (!esIdTurnoPago(campos.idTurno)) return { ok: false, error: "Turno inválido" };

  const resultado = calcularPago(campos);
  if ("error" in resultado) return { ok: false, error: resultado.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_pago", {
    p_id_turno: campos.idTurno,
    p_importe_base: centavosATexto(resultado.importes.base),
    p_descuento: centavosATexto(resultado.importes.descuento),
    p_medio: campos.medio,
  });

  if (error) return { ok: false, error: error.message };

  refrescarPagos(campos.idTurno);
  redirect(`/turnos/${campos.idTurno}/pago?ok=registrado`);
}

// HU-14. Corregir importe y/o medio del MISMO pago, con motivo. Queda el historial.
export async function corregirPago(
  _prev: EstadoPago,
  formData: FormData
): Promise<EstadoPago> {
  const sinPermiso = await exigirAccion("pagos.corregir");
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const campos = { ...camposDesde(formData), motivo: String(formData.get("motivo") ?? "") };
  if (!esIdTurnoPago(campos.idTurno)) return { ok: false, error: "Turno inválido" };

  const errorValidacion = validarCorreccion(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resultado = calcularPago(campos);
  if ("error" in resultado) return { ok: false, error: resultado.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_corregir_pago", {
    p_id_turno: campos.idTurno,
    p_importe_base: centavosATexto(resultado.importes.base),
    p_descuento: centavosATexto(resultado.importes.descuento),
    p_medio: campos.medio,
    p_motivo: campos.motivo.trim(),
  });

  if (error) return { ok: false, error: error.message };

  refrescarPagos(campos.idTurno);
  redirect(`/turnos/${campos.idTurno}/pago?ok=corregido`);
}

// HU-22. Reembolso total del pago. La base bloquea el pago y rechaza un segundo reembolso
// (un doble envío no duplica). El estado del turno no cambia.
export async function registrarReembolso(
  _prev: EstadoPago,
  formData: FormData
): Promise<EstadoPago> {
  const sinPermiso = await exigirAccion("pagos.reembolsar");
  if (sinPermiso) return { ok: false, error: sinPermiso };

  const idTurno = String(formData.get("id_turno") ?? "").trim();
  if (!esIdTurnoPago(idTurno)) return { ok: false, error: "Turno inválido" };

  const campos = {
    motivo: String(formData.get("motivo") ?? ""),
    detalle: String(formData.get("detalle") ?? ""),
    medio: String(formData.get("medio_devolucion") ?? ""),
  };
  const errorValidacion = validarReembolso(campos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_reembolso", {
    p_id_turno: idTurno,
    p_motivo: campos.motivo,
    p_detalle: campos.detalle.trim() || null,
    p_medio: campos.medio,
  });

  if (error) return { ok: false, error: error.message };

  refrescarPagos(idTurno);
  redirect(`/turnos/${idTurno}/pago?ok=reembolsado`);
}

// HU-14. Listado de pagos con filtros (paciente y período de la fecha del pago).
// HU-22: suma el filtro Con / Sin reembolso.
export async function listarPagos(filtros: FiltrosPagos): Promise<{
  data: ResultadoPagos | null;
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("pagos.consultar");
  if (sinPermiso) return { data: null, error: sinPermiso };

  const errorValidacion = validarFiltrosPagos(filtros);
  if (errorValidacion) return { data: null, error: errorValidacion };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_pagos", {
    p_texto: filtros.texto || null,
    p_desde: filtros.desde,
    p_hasta: filtros.hasta,
    p_pagina: filtros.pagina,
    p_reembolso: filtros.reembolso,
  });

  if (error) return { data: null, error: error.message };

  const resultado = data as ResultadoPagos;
  return {
    data: {
      ...resultado,
      total: Number(resultado.total),
      pagos: (resultado.pagos ?? []).map((p) => ({
        ...p,
        fecha_turno: String(p.fecha_turno).slice(0, 10),
        estado_pago: p.estado_pago ?? (p.reembolso ? "Reembolsado" : "Pagado"),
        reembolso: p.reembolso ?? null,
      })),
    },
    error: null,
  };
}
