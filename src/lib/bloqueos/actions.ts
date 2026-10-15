"use server";

import { revalidatePath } from "next/cache";
import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  validarBloqueo,
  type BloqueoVista,
  type CamposBloqueo,
  type TurnoAfectado,
} from "@/lib/bloqueos/validar";
import { hoyArgentina } from "@/lib/atencion/validar";

export type EstadoBloqueo = {
  error: string | null;
  guardado: boolean;
  turnos: TurnoAfectado[] | null;
  campos: CamposBloqueo | null;
};

const vacio: CamposBloqueo = {
  idProfesional: "",
  desde: "",
  hasta: "",
  horaDesde: "",
  horaHasta: "",
  motivo: "",
};

function camposDesde(formData: FormData): CamposBloqueo {
  return {
    idProfesional: String(formData.get("id_profesional") ?? ""),
    desde: String(formData.get("desde") ?? ""),
    hasta: String(formData.get("hasta") ?? ""),
    horaDesde: String(formData.get("hora_desde") ?? ""),
    horaHasta: String(formData.get("hora_hasta") ?? ""),
    motivo: String(formData.get("motivo") ?? ""),
  };
}

function dia(valor: string | null | undefined): string {
  return String(valor ?? "").slice(0, 10);
}

function normalizarBloqueo(bloqueo: BloqueoVista): BloqueoVista {
  return {
    ...bloqueo,
    fecha_desde: dia(bloqueo.fecha_desde),
    fecha_hasta: dia(bloqueo.fecha_hasta),
    hora_desde: bloqueo.hora_desde ?? null,
    hora_hasta: bloqueo.hora_hasta ?? null,
    dia_completo: Boolean(bloqueo.dia_completo),
  };
}

function refrescarAgendas() {
  revalidatePath("/bloqueos");
  revalidatePath("/agenda");
  revalidatePath("/disponibilidad");
  revalidatePath("/mi-agenda");
  revalidatePath("/");
}

async function invocarBloqueo(
  campos: CamposBloqueo,
  soloConsultar: boolean
): Promise<EstadoBloqueo> {
  const errorValidacion = validarBloqueo(campos, hoyArgentina());
  if (errorValidacion) return { error: errorValidacion, guardado: false, turnos: null, campos };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_crear_bloqueo", {
    p_id_profesional: campos.idProfesional.trim() || null,
    p_fecha_desde: campos.desde.trim(),
    p_fecha_hasta: campos.hasta.trim(),
    p_hora_desde: campos.horaDesde.trim() || null,
    p_hora_hasta: campos.horaHasta.trim() || null,
    p_motivo: campos.motivo.trim(),
    p_solo_consultar: soloConsultar,
  });

  if (error) return { error: error.message, guardado: false, turnos: null, campos };

  const cuerpo = data as { guardado?: boolean; turnos_afectados?: TurnoAfectado[] };
  const turnos = (cuerpo.turnos_afectados ?? []).map((t) => ({
    ...t,
    fecha: dia(t.fecha),
  }));

  if (!soloConsultar) refrescarAgendas();
  return { error: null, guardado: Boolean(cuerpo.guardado), turnos, campos };
}

// HU-33. Antes de guardar: los turnos confirmados que quedan adentro (no se cancelan).
export async function previsualizarBloqueo(
  _prev: EstadoBloqueo,
  formData: FormData
): Promise<EstadoBloqueo> {
  const sinPermiso = await exigirAccion("bloqueos.gestionar");
  if (sinPermiso) return { error: sinPermiso, guardado: false, turnos: null, campos: camposDesde(formData) };
  return invocarBloqueo(camposDesde(formData), true);
}

// HU-33. Crea el bloqueo. Los turnos afectados se conservan.
export async function crearBloqueo(
  _prev: EstadoBloqueo,
  formData: FormData
): Promise<EstadoBloqueo> {
  const sinPermiso = await exigirAccion("bloqueos.gestionar");
  if (sinPermiso) return { error: sinPermiso, guardado: false, turnos: null, campos: camposDesde(formData) };
  return invocarBloqueo(camposDesde(formData), false);
}

export async function listarBloqueos(): Promise<{
  data: (BloqueoVista & {
    nombre_profesional: string | null;
    apellido_profesional: string | null;
    nombre_creador: string | null;
    apellido_creador: string | null;
    eliminable: boolean;
  })[];
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("bloqueos.gestionar");
  if (sinPermiso) return { data: [], error: sinPermiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_bloqueos");
  if (error) return { data: [], error: error.message };

  const filas = (data ?? []) as (BloqueoVista & {
    nombre_profesional: string | null;
    apellido_profesional: string | null;
    nombre_creador: string | null;
    apellido_creador: string | null;
    eliminable: boolean;
  })[];
  return {
    data: filas.map((b) => ({ ...b, ...normalizarBloqueo(b) })),
    error: null,
  };
}

export async function eliminarBloqueo(
  _prev: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const sinPermiso = await exigirAccion("bloqueos.gestionar");
  if (sinPermiso) return { error: sinPermiso };

  const id = String(formData.get("id_bloqueo") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "El bloqueo no existe" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_eliminar_bloqueo", { p_id_bloqueo: id });
  if (error) return { error: error.message };

  refrescarAgendas();
  return { error: null };
}

// HU-33. Bloqueos que pisan el rango, para mostrarlos en la agenda (no los administra).
export async function consultarBloqueosAgenda(
  idProfesional: string,
  desde: string,
  hasta: string
): Promise<{ data: BloqueoVista[]; error: string | null }> {
  const sinPermiso = await exigirAccion("bloqueos.consultar");
  if (sinPermiso) return { data: [], error: sinPermiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_bloqueos_agenda", {
    p_id_profesional: idProfesional,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) return { data: [], error: error.message };

  return { data: ((data ?? []) as BloqueoVista[]).map(normalizarBloqueo), error: null };
}
