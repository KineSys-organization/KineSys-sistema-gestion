import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UsuarioGestion = {
  id_usuario: string;
  nombre_usuario: string;
  apellido_usuario: string;
  rol_usuario: "Gerente" | "Profesional" | "Mesa de Entradas";
};

export function validarLogin(email: string, password: string): string | null {
  if (!email.trim()) return "Ingresá tu mail";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return "El mail no es válido";
  if (!password) return "Ingresá tu contraseña";
  return null;
}

// Quién puede entrar lo decide la función de la base, no el front.
export async function obtenerUsuarioGestion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase.rpc("fn_acceso_gestion");
  if (error || !data || data.length === 0) {
    await supabase.auth.signOut();
    return null;
  }

  return data[0] as UsuarioGestion;
}

export async function exigirGerente() {
  const usuario = await obtenerUsuarioGestion();
  if (!usuario) redirect("/login");
  if (usuario.rol_usuario !== "Gerente") redirect("/");
  return usuario;
}

/** Recepción: Gerente o Mesa de Entradas (HU-04 pacientes). */
export async function exigirRecepcion() {
  const usuario = await obtenerUsuarioGestion();
  if (!usuario) redirect("/login");
  if (
    usuario.rol_usuario !== "Gerente" &&
    usuario.rol_usuario !== "Mesa de Entradas"
  ) {
    redirect("/");
  }
  return usuario;
}
