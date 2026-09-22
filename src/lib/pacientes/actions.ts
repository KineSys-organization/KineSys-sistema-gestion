"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EstadoFormulario, ObraSocial, Paciente } from "@/lib/pacientes/tipos";
import {
  esIdPaciente,
  parsearObrasFormulario,
  validarAltaPaciente,
  validarEdicionPaciente,
} from "@/lib/pacientes/validar";

const PATH = "/pacientes";

function estadoError(mensaje: string): EstadoFormulario {
  return { ok: false, error: mensaje };
}

function normalizarPaciente(fila: Paciente): Paciente {
  return {
    ...fila,
    fecha_nacimiento_paciente: String(fila.fecha_nacimiento_paciente).slice(0, 10),
    obras_sociales: Array.isArray(fila.obras_sociales) ? fila.obras_sociales : [],
  };
}

export async function listarObrasSociales(): Promise<{
  data: ObraSocial[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_obras_sociales");

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as ObraSocial[], error: null };
}

export async function buscarPacientes(
  texto: string
): Promise<{ data: Paciente[]; error: string | null }> {
  const consulta = texto.trim();
  if (!consulta) {
    return { data: [], error: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_buscar_pacientes", {
    p_texto: consulta,
  });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: ((data ?? []) as Paciente[]).map(normalizarPaciente),
    error: null,
  };
}

export async function obtenerPaciente(id: string): Promise<{
  data: Paciente | null;
  error: string | null;
}> {
  if (!esIdPaciente(id)) {
    return { data: null, error: "Paciente inválido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_obtener_paciente", {
    p_id_paciente: id,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: normalizarPaciente(data as Paciente), error: null };
}

export async function registrarPaciente(
  _prev: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const campos = {
    nombre_paciente: String(formData.get("nombre_paciente") ?? ""),
    apellido_paciente: String(formData.get("apellido_paciente") ?? ""),
    dni_paciente: String(formData.get("dni_paciente") ?? ""),
    fecha_nacimiento_paciente: String(formData.get("fecha_nacimiento_paciente") ?? ""),
    telefono_paciente: String(formData.get("telefono_paciente") ?? ""),
    mail_paciente: String(formData.get("mail_paciente") ?? ""),
    obras: parsearObrasFormulario(formData),
  };

  const errorValidacion = validarAltaPaciente(campos);
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_paciente", {
    p_nombre: campos.nombre_paciente.trim(),
    p_apellido: campos.apellido_paciente.trim(),
    p_dni: Number(campos.dni_paciente),
    p_fecha_nacimiento: campos.fecha_nacimiento_paciente,
    p_telefono: campos.telefono_paciente.trim(),
    p_mail: campos.mail_paciente.trim(),
    p_obras: campos.obras.map((obra) => ({
      id_obra_social: obra.id_obra_social,
      numero_afiliado: obra.numero_afiliado.trim(),
    })),
  });

  if (error) return estadoError(error.message);

  revalidatePath(PATH);
  redirect("/pacientes");
}

export async function editarPaciente(
  idPaciente: string,
  _prev: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  if (!esIdPaciente(idPaciente)) return estadoError("Paciente inválido");

  const campos = {
    nombre_paciente: String(formData.get("nombre_paciente") ?? ""),
    apellido_paciente: String(formData.get("apellido_paciente") ?? ""),
    telefono_paciente: String(formData.get("telefono_paciente") ?? ""),
    mail_paciente: String(formData.get("mail_paciente") ?? ""),
    obras: parsearObrasFormulario(formData),
  };

  const errorValidacion = validarEdicionPaciente(campos);
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_paciente", {
    p_id_paciente: idPaciente,
    p_nombre: campos.nombre_paciente.trim(),
    p_apellido: campos.apellido_paciente.trim(),
    p_telefono: campos.telefono_paciente.trim(),
    p_mail: campos.mail_paciente.trim(),
    p_obras: campos.obras.map((obra) => ({
      id_obra_social: obra.id_obra_social,
      numero_afiliado: obra.numero_afiliado.trim(),
    })),
  });

  if (error) return estadoError(error.message);

  revalidatePath(PATH);
  revalidatePath(`/pacientes/${idPaciente}`);
  return { ok: true, error: null };
}
