import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PacientePortal } from "@/lib/portal/tipos";

// HU-23. El portal del paciente es aparte del sistema de gestión: otra pantalla de ingreso
// (/portal/ingresar) y otra función de acceso (fn_acceso_paciente). Quién es el paciente lo
// decide la base con auth.uid(); el front nunca manda el id del paciente.

export const RUTA_INGRESO_PORTAL = "/portal/ingresar";

// `cache`: layout, página y actions del mismo request comparten una sola consulta.
export const obtenerPacientePortal = cache(async (): Promise<PacientePortal | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase.rpc("fn_acceso_paciente");
  if (error || !data) return null;

  const paciente = data as PacientePortal;
  return { ...paciente, obras_sociales: paciente.obras_sociales ?? [] };
});

// Para páginas del portal: sin paciente válido -> pantalla de ingreso.
export async function exigirPaciente(): Promise<PacientePortal> {
  const paciente = await obtenerPacientePortal();
  if (!paciente) redirect(RUTA_INGRESO_PORTAL);
  return paciente;
}

// Para server actions del portal: no redirige, devuelve el mensaje (o null si puede).
export async function exigirPacienteAccion(): Promise<string | null> {
  const paciente = await obtenerPacientePortal();
  if (!paciente) return "Tu sesión expiró. Volvé a ingresar";
  return null;
}
