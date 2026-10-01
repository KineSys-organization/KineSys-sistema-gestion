"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logout } from "@/app/(auth)/logout/actions";
import { exigirAccion, obtenerUsuarioGestion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  esIdUsuarioGestion,
  validarAltaUsuarioGestion,
  validarEdicionUsuarioGestion,
  validarRolUsuarioGestion,
} from "./validar";
import type {
  EstadoFormularioUsuario,
  UsuarioGestionEdicion,
  UsuarioGestionListado,
} from "./tipos";

function estadoError(error: string): EstadoFormularioUsuario {
  return { ok: false, error };
}

function parsearUsuario(data: unknown): UsuarioGestionEdicion {
  const usuario = data as UsuarioGestionEdicion;
  return {
    ...usuario,
    fecha_nacimiento_usuario: String(usuario.fecha_nacimiento_usuario ?? "").slice(0, 10),
    es_usuario_actual: Boolean(usuario.es_usuario_actual),
    es_ultimo_gerente_activo: Boolean(usuario.es_ultimo_gerente_activo),
  };
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

export async function obtenerDetalleUsuarioGestion(id: string): Promise<{
  data: UsuarioGestionEdicion | null;
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("usuarios.gestionar");
  if (sinPermiso) return { data: null, error: sinPermiso };
  if (!esIdUsuarioGestion(id)) return { data: null, error: "Usuario inválido" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_obtener_usuario_gestion", {
    p_id_usuario: id,
  });
  if (error) return { data: null, error: error.message };
  return { data: parsearUsuario(data), error: null };
}

export async function editarUsuarioGestion(
  id: string,
  _prev: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const sinPermiso = await exigirAccion("usuarios.gestionar");
  if (sinPermiso) return estadoError(sinPermiso);
  if (!esIdUsuarioGestion(id)) return estadoError("Usuario inválido");

  const campos = {
    nombre_usuario: String(formData.get("nombre_usuario") ?? ""),
    apellido_usuario: String(formData.get("apellido_usuario") ?? ""),
    telefono_usuario: String(formData.get("telefono_usuario") ?? ""),
  };
  const errorValidacion = validarEdicionUsuarioGestion(campos);
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_usuario_gestion", {
    p_id_usuario: id,
    p_nombre: campos.nombre_usuario.trim(),
    p_apellido: campos.apellido_usuario.trim(),
    p_telefono: campos.telefono_usuario.trim(),
  });
  if (error) return estadoError(error.message);

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}/editar`);
  redirect(`/usuarios/${id}/editar`);
}

export async function cambiarRolUsuarioGestion(
  id: string,
  _prev: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const sinPermiso = await exigirAccion("usuarios.gestionar");
  if (sinPermiso) return estadoError(sinPermiso);
  if (!esIdUsuarioGestion(id)) return estadoError("Usuario inválido");

  const rol = String(formData.get("rol_usuario") ?? "");
  const errorRol = validarRolUsuarioGestion(rol);
  if (errorRol) return estadoError(errorRol);

  const sesion = await obtenerUsuarioGestion();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cambiar_rol_usuario_gestion", {
    p_id_usuario: id,
    p_rol: rol,
  });
  if (error) return estadoError(error.message);

  if (sesion?.id_usuario === id && rol === "Mesa de Entradas") {
    await logout();
  }

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}/editar`);
  redirect("/usuarios");
}

export async function cambiarEstadoUsuarioGestion(
  id: string,
  activo: boolean
): Promise<{ ok: boolean; error: string | null }> {
  const sinPermiso = await exigirAccion("usuarios.gestionar");
  if (sinPermiso) return { ok: false, error: sinPermiso };
  if (!esIdUsuarioGestion(id)) return { ok: false, error: "Usuario inválido" };

  const sesion = await obtenerUsuarioGestion();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cambiar_estado_usuario_gestion", {
    p_id_usuario: id,
    p_activo: activo,
  });
  if (error) return { ok: false, error: error.message };

  if (sesion?.id_usuario === id && activo === false) {
    await logout();
  }

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}/editar`);
  return { ok: true, error: null };
}
