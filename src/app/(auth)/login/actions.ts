"use server";

import { redirect } from "next/navigation";
import { validarLogin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = {
  error: string | null;
};

export async function login(_prevState: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const errorValidacion = validarLogin(email, password);
  if (errorValidacion) {
    return { error: errorValidacion };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { error: "Mail o contraseña incorrectos" };
  }

  const { data, error: errorAcceso } = await supabase.rpc("fn_acceso_gestion");
  if (errorAcceso || !data || data.length === 0) {
    await supabase.auth.signOut();
    return {
      error: errorAcceso?.message ?? "No tenés permiso para acceder al sistema de gestión",
    };
  }

  const sesion = data[0] as { rol_usuario?: string };
  redirect(sesion.rol_usuario === "Gerente" ? "/indicadores" : "/");
}
