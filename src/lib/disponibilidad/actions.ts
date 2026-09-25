"use server";

import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profesional } from "@/lib/profesionales/tipos";
import type { Disponibilidad, EstadoConsulta } from "@/lib/disponibilidad/tipos";
import { esUuid, validarConsultaDisponibilidad } from "@/lib/disponibilidad/validar";
import type { CalendarioDisponibilidad } from "@/lib/disponibilidad/calendario";

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
  const sinPermiso = await exigirAccion("disponibilidad.consultar");
  if (sinPermiso) return { data: [], error: sinPermiso };

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

// Calendario de los próximos 30 días: cuántos horarios libres hay cada día.
export async function obtenerCalendario(campos: {
  id_profesional: string;
  id_servicio: string;
}): Promise<{ data: CalendarioDisponibilidad | null; error: string | null }> {
  const sinPermiso = await exigirAccion("disponibilidad.consultar");
  if (sinPermiso) return { data: null, error: sinPermiso };

  if (!esUuid(campos.id_profesional)) return { data: null, error: "Profesional inválido" };
  if (!esUuid(campos.id_servicio)) return { data: null, error: "Servicio inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_disponibilidad_calendario", {
    p_id_profesional: campos.id_profesional,
    p_id_servicio: campos.id_servicio,
  });

  if (error) return { data: null, error: error.message };

  const calendario = data as CalendarioDisponibilidad;
  return {
    data: {
      ...calendario,
      desde: String(calendario.desde).slice(0, 10),
      hasta: String(calendario.hasta).slice(0, 10),
      dias: (calendario.dias ?? []).map((d) => ({
        fecha: String(d.fecha).slice(0, 10),
        libres: Number(d.libres),
      })),
    },
    error: null,
  };
}

// También la usa HU-06 para mostrar el horario elegido antes de confirmar.
export async function obtenerDisponibilidad(campos: {
  id_profesional: string;
  id_servicio: string;
  fecha: string;
}): Promise<EstadoConsulta> {
  const sinPermiso = await exigirAccion("disponibilidad.consultar");
  if (sinPermiso) return { ok: false, error: sinPermiso, data: null };

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
