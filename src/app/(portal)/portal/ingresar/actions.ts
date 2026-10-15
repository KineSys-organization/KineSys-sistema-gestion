"use server";

import { redirect } from "next/navigation";
import { validarLogin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RUTA_INGRESO_PORTAL } from "@/lib/portal/acceso";

// HU-23. Ingreso del paciente al turno online. Mismo esquema que el login de gestión,
// pero con fn_acceso_paciente: si la cuenta no es de un paciente con ficha activa,
// se cierra la sesión y se muestra el mensaje de la base.

export type EstadoIngreso = {
  error: string | null;
};

export async function ingresarPaciente(
  _prevState: EstadoIngreso,
  formData: FormData
): Promise<EstadoIngreso> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const errorValidacion = validarLogin(email, password);
  if (errorValidacion) return { error: errorValidacion };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: "Mail o contraseña incorrectos" };

  const { data, error: errorAcceso } = await supabase.rpc("fn_acceso_paciente");
  if (errorAcceso || !data) {
    await supabase.auth.signOut();
    return { error: errorAcceso?.message ?? "No pudimos encontrar tu ficha de paciente" };
  }

  redirect("/portal");
}

export async function salirPortal() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(RUTA_INGRESO_PORTAL);
}
