"use server";

import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  DashboardOperativo,
  EstadoDashboardOperativo,
  EstadoIndicadores,
  EstadoIndicadoresEconomicos,
  IndicadoresEconomicos,
  IndicadoresGenerales,
} from "@/lib/indicadores/tipos";
import { validarPeriodo, type Periodo } from "@/lib/indicadores/validar";

// HU-26. La pantalla /indicadores lee desde/hasta de la URL y llama a esta action.
export async function obtenerIndicadores(periodo: Periodo): Promise<EstadoIndicadores> {
  const sinPermiso = await exigirAccion("indicadores.consultar");
  if (sinPermiso) return { ok: false, error: sinPermiso, data: null };

  const errorValidacion = validarPeriodo(periodo);
  if (errorValidacion) return { ok: false, error: errorValidacion, data: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_indicadores_generales", {
    p_desde: periodo.desde.trim(),
    p_hasta: periodo.hasta.trim(),
  });

  if (error) return { ok: false, error: error.message, data: null };

  return { ok: true, error: null, data: data as IndicadoresGenerales };
}

// HU-19. Sección "Económicos": ingresos por fecha del pago, reembolsos, evolución y desgloses.
// Todo lo calcula la base (fn_consultar_indicadores_economicos, solo lectura, solo Gerente).
export async function obtenerIndicadoresEconomicos(
  periodo: Periodo
): Promise<EstadoIndicadoresEconomicos> {
  const sinPermiso = await exigirAccion("indicadores.consultar");
  if (sinPermiso) return { ok: false, error: sinPermiso, data: null };

  const errorValidacion = validarPeriodo(periodo);
  if (errorValidacion) return { ok: false, error: errorValidacion, data: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_indicadores_economicos", {
    p_desde: periodo.desde.trim(),
    p_hasta: periodo.hasta.trim(),
  });

  if (error) return { ok: false, error: error.message, data: null };

  return { ok: true, error: null, data: data as IndicadoresEconomicos };
}

// HU-18. El desglose y la ocupación se calculan en la base con las franjas vigentes.
export async function obtenerDashboardOperativo(periodo: Periodo): Promise<EstadoDashboardOperativo> {
  const sinPermiso = await exigirAccion("indicadores.consultar");
  if (sinPermiso) return { ok: false, error: sinPermiso, data: null };

  const errorValidacion = validarPeriodo(periodo);
  if (errorValidacion) return { ok: false, error: errorValidacion, data: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_dashboard_operativo", {
    p_desde: periodo.desde.trim(),
    p_hasta: periodo.hasta.trim(),
  });

  if (error) return { ok: false, error: error.message, data: null };

  return { ok: true, error: null, data: data as DashboardOperativo };
}
