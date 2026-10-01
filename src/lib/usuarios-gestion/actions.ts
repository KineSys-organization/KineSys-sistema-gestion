"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validarAltaUsuarioGestion } from "./validar";
import type { EstadoFormularioUsuario, UsuarioGestionListado } from "./tipos";

function estadoError(error: string): EstadoFormularioUsuario {
  return { ok: false, error };
}

export async function listarUsuariosGestion(): Promise<{
  data: UsuarioGestionListado[];
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("usuarios.gestionar");
  if (sinPermiso) return { data: [], error: sinPermiso };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_usuarios_gestion");
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as UsuarioGestionListado[], error: null };
}

async function mensajeEdge(error: { message: string }, data: unknown): Promise<string> {
  if (data && typeof data === "object") {
    const body = data as { error?: string; message?: string };
    if (body.error) return body.error;
    if (body.message) return body.message;
  }
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json() as { error?: string; message?: string };
      if (body.error) return body.error;
      if (body.message) return body.message;
    } catch { /* se usa el mensaje del SDK si no hay JSON */ }
  }
  return error.message;
}

export async function crearUsuarioGestion(
  _prev: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const sinPermiso = await exigirAccion("usuarios.gestionar");
  if (sinPermiso) return estadoError(sinPermiso);

  const campos = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    nombre_usuario: String(formData.get("nombre_usuario") ?? ""),
    apellido_usuario: String(formData.get("apellido_usuario") ?? ""),
    fecha_nacimiento_usuario: String(formData.get("fecha_nacimiento_usuario") ?? ""),
    dni_usuario: String(formData.get("dni_usuario") ?? ""),
    telefono_usuario: String(formData.get("telefono_usuario") ?? ""),
    rol_usuario: String(formData.get("rol_usuario") ?? ""),
  };
  const errorValidacion = validarAltaUsuarioGestion(campos);
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("crear-usuario-gestion", {
    body: {
      ...campos,
      email: campos.email.trim(),
      nombre_usuario: campos.nombre_usuario.trim(),
      apellido_usuario: campos.apellido_usuario.trim(),
      dni_usuario: Number(campos.dni_usuario),
      telefono_usuario: campos.telefono_usuario.trim(),
    },
  });
  if (error) return estadoError(await mensajeEdge(error, data));

  revalidatePath("/usuarios");
  redirect("/usuarios");
}
