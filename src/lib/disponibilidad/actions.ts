"use server";

import { createClient } from "@/lib/supabase/server";
import type { Profesional } from "@/lib/profesionales/tipos";
import type { Disponibilidad, EstadoConsulta } from "@/lib/disponibilidad/tipos";
import { validarConsultaDisponibilidad } from "@/lib/disponibilidad/validar";

function normalizar(data: Disponibilidad): Disponibilidad {
  return {
    ...data,
    fecha: String(data.fecha).slice(0, 10),
    horarios: Array.isArray(data.horarios) ? data.horarios.map(String) : [],
    mensaje: data.mensaje ?? null,
  };
}

export async function listarProfesionalesParaDisponibilidad(): Promise<{
  data: Profesional[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_profesionales");

  if (error) {
    return { data: [], error: error.message };
  }

  const activos = ((data ?? []) as Profesional[]).filter(
    (p) => p.activo && (p.servicios?.length ?? 0) > 0
  );

  return { data: activos, error: null };
}

export async function consultarDisponibilidad(
  _prev: EstadoConsulta,
  formData: FormData
): Promise<EstadoConsulta> {
  const campos = {
    id_profesional: String(formData.get("id_profesional") ?? ""),
    id_servicio: String(formData.get("id_servicio") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
  };

  const errorValidacion = validarConsultaDisponibilidad(campos);
  if (errorValidacion) {
    return { ok: false, error: errorValidacion, data: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_disponibilidad", {
    p_id_profesional: campos.id_profesional,
    p_id_servicio: campos.id_servicio,
    p_fecha: campos.fecha,
  });

  if (error) {
    return { ok: false, error: error.message, data: null };
  }

  return { ok: true, error: null, data: normalizar(data as Disponibilidad) };
}
