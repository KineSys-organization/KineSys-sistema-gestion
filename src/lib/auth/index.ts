import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MENSAJE_SIN_PERMISO, puedeHacer, type Accion, type Rol } from "@/lib/auth/permisos";

export type UsuarioGestion = {
  id_usuario: string;
  nombre_usuario: string;
  apellido_usuario: string;
  rol_usuario: Rol;
};

// Adonde va quien entra a una pantalla que su rol no puede usar (Inicio muestra el aviso).
export const RUTA_SIN_PERMISO = "/?error=sin-permiso";

export function validarLogin(email: string, password: string): string | null {
  if (!email.trim()) return "Ingresá tu mail";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return "El mail no es válido";
  if (!password) return "Ingresá tu contraseña";
  return null;
}

// Quién puede entrar lo decide la función de la base, no el front.
// `cache` hace que layout, página y actions del mismo request compartan una sola consulta.
export const obtenerUsuarioGestion = cache(async () => {
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
});

// Para páginas: sin sesión -> /login; rol que no alcanza -> Inicio con aviso.
async function exigirRol(rolesPermitidos: Rol[]) {
  const usuario = await obtenerUsuarioGestion();
  if (!usuario) redirect("/login");
  if (!rolesPermitidos.includes(usuario.rol_usuario)) redirect(RUTA_SIN_PERMISO);
  return usuario;
}

export async function exigirGerente() {
  return exigirRol(["Gerente"]);
}

/** Recepción: Gerente o Mesa de Entradas. */
export async function exigirRecepcion() {
  return exigirRol(["Gerente", "Mesa de Entradas"]);
}

// Para server actions: se pueden invocar sin pasar por la página, así que repiten el chequeo.
// No redirige: devuelve el mensaje de error (o null si puede) para mostrarlo en el formulario.
export async function exigirAccion(accion: Accion): Promise<string | null> {
  const usuario = await obtenerUsuarioGestion();
  if (!usuario) return "Tu sesión expiró. Volvé a iniciar sesión";
  if (!puedeHacer(usuario.rol_usuario, accion)) return MENSAJE_SIN_PERMISO;
  return null;
}
