"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validarAltaProfesional, validarEdicionProfesional } from "@/lib/profesionales/validar";
import type { DetalleProfesionalEdicion, EstadoFormulario, Profesional } from "@/lib/profesionales/tipos";

import { esIdProfesional } from "./horarios";

const PATH = "/profesionales";

function estadoError(mensaje: string): EstadoFormulario {
  return { ok: false, error: mensaje };
}

export async function listarProfesionales(): Promise<{
  data: Profesional[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_profesionales");

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as Profesional[], error: null };
}

async function mensajeEdge(error: { message: string }, data: unknown): Promise<string> {
  if (data && typeof data === "object") {
    const cuerpo = data as { error?: string; message?: string };
    if (cuerpo.error) return cuerpo.error;
    if (cuerpo.message) return cuerpo.message;
  }

  const contexto = (error as { context?: Response }).context;
  if (contexto && typeof contexto.json === "function") {
    try {
      const cuerpo = (await contexto.json()) as { error?: string; message?: string };
      if (cuerpo.error) return cuerpo.error;
      if (cuerpo.message) return cuerpo.message;
    } catch {
      // si el body no es JSON, usamos el mensaje del SDK
    }
  }

  return error.message;
}

export async function crearProfesional(
  _prev: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const servicios = formData.getAll("servicios").map(String).filter(Boolean);
  const campos = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    nombre_usuario: String(formData.get("nombre_usuario") ?? ""),
    apellido_usuario: String(formData.get("apellido_usuario") ?? ""),
    fecha_nacimiento_usuario: String(formData.get("fecha_nacimiento_usuario") ?? ""),
    dni_usuario: String(formData.get("dni_usuario") ?? ""),
    telefono_usuario: String(formData.get("telefono_usuario") ?? ""),
    matricula: String(formData.get("matricula") ?? ""),
    servicios,
  };

  const errorValidacion = validarAltaProfesional(campos);
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("crear-profesional", {
    body: {
      email: campos.email.trim(),
      password: campos.password,
      nombre_usuario: campos.nombre_usuario.trim(),
      apellido_usuario: campos.apellido_usuario.trim(),
      fecha_nacimiento_usuario: campos.fecha_nacimiento_usuario,
      dni_usuario: Number(campos.dni_usuario),
      telefono_usuario: campos.telefono_usuario.trim(),
      matricula: campos.matricula.trim(),
      servicios,
    },
  });

  if (error) return estadoError(await mensajeEdge(error, data));

  revalidatePath(PATH);
  redirect("/profesionales");
}

export async function alternarProfesional(id: string): Promise<{
  ok: boolean;
  error: string | null;
  activo?: boolean;
}> {
  if (!esIdProfesional(id)) return { ok: false, error: "Profesional inválido" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_alternar_estado_profesional", {
    p_id_usuario: id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  revalidatePath("/disponibilidad");
  revalidatePath(`/profesionales/${id}/horarios`);
  return { ok: true, error: null, activo: Boolean(data) };
}

export async function obtenerProfesional(id: string): Promise<{
  data: DetalleProfesionalEdicion | null;
  error: string | null;
}> {
  if (!esIdProfesional(id)) return { data: null, error: "Profesional inválido" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_obtener_profesional", {
    p_id_usuario: id,
  });
  if (error) return { data: null, error: error.message };
  const profesional = data as DetalleProfesionalEdicion;
  return { data: {
    ...profesional,
    fecha_nacimiento_usuario: String(profesional.fecha_nacimiento_usuario ?? "").slice(0, 10),
  }, error: null };
}

export async function editarProfesional(
  id: string,
  prev: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const servicios = formData.getAll("servicios").map(String).filter(Boolean);
  const campos = {
    nombre_usuario: String(formData.get("nombre_usuario") ?? ""),
    apellido_usuario: String(formData.get("apellido_usuario") ?? ""),
    fecha_nacimiento_usuario: String(formData.get("fecha_nacimiento_usuario") ?? ""),
    dni_usuario: String(formData.get("dni_usuario") ?? ""),
    telefono_usuario: String(formData.get("telefono_usuario") ?? ""),
    matricula: String(formData.get("matricula") ?? ""),
    servicios,
  };

  if (!esIdProfesional(id)) return estadoError("Profesional inválido");
  const errorValidacion = validarEdicionProfesional(campos);
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_editar_profesional", {
    p_id_usuario: id,
    p_nombre: campos.nombre_usuario.trim(),
    p_apellido: campos.apellido_usuario.trim(),
    p_fecha_nacimiento: campos.fecha_nacimiento_usuario,
    p_dni: Number(campos.dni_usuario),
    p_telefono: campos.telefono_usuario.trim(),
    p_matricula: campos.matricula.trim(),
    p_servicios: servicios,
    p_confirmar_servicios: formData.get("confirmar") === "si" && prev.datosConfirmacion === JSON.stringify(campos),
  });

  if (error) return estadoError(error.message);
  if (data.requiere_confirmacion) return { ok: false, error: null, confirmacion: data.mensaje, datosConfirmacion: JSON.stringify(campos) };

  revalidatePath(PATH);
  revalidatePath(`/profesionales/${id}/editar`);
  revalidatePath(`/profesionales/${id}/horarios`);
  revalidatePath("/disponibilidad");
  redirect("/profesionales");
}
