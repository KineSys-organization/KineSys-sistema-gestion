"use server";

import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DashboardProfesional } from "@/lib/dashboard/tipos";
import { esMesValido } from "@/lib/dashboard/calendario";

// HU-15. Dashboard del Profesional logueado: contadores del día, de la semana y
// sus turnos del mes. El profesional no se manda: la base lo toma de auth.uid().
export async function consultarDashboard(mes: string): Promise<{
  data: DashboardProfesional | null;
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("atencion.dashboard");
  if (sinPermiso) return { data: null, error: sinPermiso };

  if (!esMesValido(mes)) return { data: null, error: "El mes no es válido" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_consultar_dashboard_profesional", {
    p_mes: `${mes}-01`,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as DashboardProfesional, error: null };
}
