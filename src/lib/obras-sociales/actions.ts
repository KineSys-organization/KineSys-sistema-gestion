"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAccion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { esIdObraSocial, validarNombreObraSocial } from "./validar";
import type { EstadoFormularioObraSocial, ObraSocialCatalogo } from "./tipos";

const PATH = "/obras-sociales";

function estadoError(error: string): EstadoFormularioObraSocial {
  return { ok: false, error };
}

export async function listarObrasSocialesCatalogo(): Promise<{
  data: ObraSocialCatalogo[];
  error: string | null;
}> {
  const sinPermiso = await exigirAccion("catalogo.gestionar");
  if (sinPermiso) return { data: [], error: sinPermiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listar_obras_sociales_gestion");
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ObraSocialCatalogo[], error: null };
}

export async function registrarObraSocial(
  _prev: EstadoFormularioObraSocial,
  formData: FormData
): Promise<EstadoFormularioObraSocial> {
  const sinPermiso = await exigirAccion("catalogo.gestionar");
  if (sinPermiso) return estadoError(sinPermiso);

  const nombre = String(formData.get("nombre") ?? "");
  const errorValidacion = validarNombreObraSocial(nombre);
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_obra_social", {
    p_nombre: nombre.trim(),
  });
  if (error) return estadoError(error.message);

  revalidatePath(PATH);
  revalidatePath("/pacientes");
  revalidatePath("/turnos");
  redirect(`${PATH}?creada=1`);
}

export async function editarObraSocial(
  _prev: EstadoFormularioObraSocial,
  formData: FormData
): Promise<EstadoFormularioObraSocial> {
  const sinPermiso = await exigirAccion("catalogo.gestionar");
  if (sinPermiso) return estadoError(sinPermiso);

  const id = String(formData.get("id_obra_social") ?? "");
  if (!esIdObraSocial(id)) return estadoError("La obra social no existe");

  const nombre = String(formData.get("nombre") ?? "");
  const errorValidacion = validarNombreObraSocial(nombre);
  if (errorValidacion) return estadoError(errorValidacion);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_obra_social", {
    p_id_obra_social: id.trim(),
    p_nombre: nombre.trim(),
  });
  if (error) return estadoError(error.message);

  revalidatePath(PATH);
  revalidatePath("/pacientes");
  revalidatePath("/turnos");
  return { ok: true, error: null };
}

export async function cambiarEstadoObraSocial(
  id: string,
  activo: boolean
): Promise<EstadoFormularioObraSocial> {
  const sinPermiso = await exigirAccion("catalogo.gestionar");
  if (sinPermiso) return estadoError(sinPermiso);
  if (!esIdObraSocial(id)) return estadoError("La obra social no existe");

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cambiar_estado_obra_social", {
    p_id_obra_social: id.trim(),
    p_activo: activo,
  });
  if (error) return estadoError(error.message);

  revalidatePath(PATH);
  revalidatePath("/pacientes");
  revalidatePath("/turnos");
  return { ok: true, error: null };
}
