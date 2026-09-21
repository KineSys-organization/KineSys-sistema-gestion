"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { precioOpcional, validarServicio } from "@/lib/servicios/validar";
import type { EstadoFormulario, Servicio } from "@/lib/servicios/tipos";

const PATH = "/servicios";

function estadoError(mensaje: string): EstadoFormulario {
  return { ok: false, error: mensaje };
}

export async function listarServicios(): Promise<{ data: Servicio[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_servicios");

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as Servicio[], error: null };
}

export async function registrarServicio(
  _prev: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const nombre = String(formData.get("nombre") ?? "");
  const duracion = String(formData.get("duracion") ?? "");
  const granularidad = String(formData.get("granularidad") ?? "");
  const precio = String(formData.get("precio") ?? "");

  const errorValidacion = validarServicio({ nombre, duracion, granularidad, precio });
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_servicio", {
    p_nombre: nombre.trim(),
    p_duracion: Number(duracion),
    p_granularidad: Number(granularidad),
    p_precio: precioOpcional(precio),
  });

  if (error) return estadoError(error.message);

  revalidatePath(PATH);
  return { ok: true, error: null };
}

export async function editarServicio(
  _prev: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const id = String(formData.get("id_servicio") ?? "");
  const nombre = String(formData.get("nombre") ?? "");
  const duracion = String(formData.get("duracion") ?? "");
  const granularidad = String(formData.get("granularidad") ?? "");
  const precio = String(formData.get("precio") ?? "");

  if (!id) return estadoError("El servicio no existe");

  const errorValidacion = validarServicio({ nombre, duracion, granularidad, precio });
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_servicio", {
    p_id_servicio: id,
    p_nombre: nombre.trim(),
    p_duracion: Number(duracion),
    p_granularidad: Number(granularidad),
    p_precio: precioOpcional(precio),
  });

  if (error) return estadoError(error.message);

  revalidatePath(PATH);
  return { ok: true, error: null };
}

export async function alternarServicio(idServicio: string): Promise<EstadoFormulario> {
  if (!idServicio) return estadoError("El servicio no existe");

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desactivar_servicio", {
    p_id_servicio: idServicio,
  });

  if (error) return estadoError(error.message);

  revalidatePath(PATH);
  return { ok: true, error: null };
}
