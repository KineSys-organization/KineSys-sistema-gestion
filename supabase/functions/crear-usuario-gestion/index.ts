import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AltaUsuario = {
  email?: string;
  password?: string;
  nombre_usuario?: string;
  apellido_usuario?: string;
  fecha_nacimiento_usuario?: string;
  dni_usuario?: number;
  telefono_usuario?: string;
  rol_usuario?: string;
};

function respuesta(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esFechaValida(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const date = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === fecha;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respuesta(405, { error: "Método no permitido" });

  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return respuesta(401, { error: "No autenticado" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return respuesta(500, { error: "Falta configurar el servidor para registrar usuarios" });
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return respuesta(401, { error: "Tu sesión expiró. Volvé a iniciar sesión" });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: gerente, error: gerenteError } = await admin
    .from("usuario")
    .select("rol_usuario, activo")
    .eq("id_usuario", authData.user.id)
    .maybeSingle();
  if (gerenteError) return respuesta(500, { error: "No se pudo verificar el permiso de Gerente" });
  if (!gerente || gerente.rol_usuario !== "Gerente" || gerente.activo !== true) {
    return respuesta(403, { error: "No tenés permisos para realizar esta acción" });
  }

  let body: AltaUsuario;
  try {
    body = await request.json() as AltaUsuario;
  } catch {
    return respuesta(400, { error: "Los datos enviados no son válidos" });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const nombre = typeof body.nombre_usuario === "string" ? body.nombre_usuario.trim() : "";
  const apellido = typeof body.apellido_usuario === "string" ? body.apellido_usuario.trim() : "";
  const fecha = typeof body.fecha_nacimiento_usuario === "string" ? body.fecha_nacimiento_usuario : "";
  const dni = body.dni_usuario;
  const telefono = typeof body.telefono_usuario === "string" ? body.telefono_usuario.trim() : "";
  const rol = body.rol_usuario;
  const nombreValido = /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return respuesta(400, { error: "El mail no es válido" });
  if (typeof body.password !== "string" || body.password.length < 8) {
    return respuesta(400, { error: "La contraseña debe tener al menos 8 caracteres" });
  }
  if (!nombreValido.test(nombre) || !nombreValido.test(apellido)) return respuesta(400, { error: "El nombre y el apellido solo pueden tener letras" });
  if (!esFechaValida(fecha)) return respuesta(400, { error: "La fecha de nacimiento no es válida" });
  const nacimiento = new Date(`${fecha}T00:00:00Z`);
  const fechaArgentina = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const hoy = new Date(`${fechaArgentina}T00:00:00Z`);
  const edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear() -
    (hoy.getUTCMonth() < nacimiento.getUTCMonth() ||
      (hoy.getUTCMonth() === nacimiento.getUTCMonth() && hoy.getUTCDate() < nacimiento.getUTCDate()) ? 1 : 0);
  if (edad < 18) return respuesta(400, { error: "El usuario debe tener al menos 18 años" });
  if (typeof dni !== "number" || !Number.isInteger(dni) || !/^\d{7,8}$/.test(String(dni))) {
    return respuesta(400, { error: "El DNI debe tener 7 u 8 números, sin puntos" });
  }
  if (!/^\d{10}$/.test(telefono)) return respuesta(400, { error: "El teléfono debe tener 10 números" });
  if (rol !== "Gerente" && rol !== "Mesa de Entradas") return respuesta(400, { error: "El rol seleccionado no es válido" });

  // Crear Auth antes de la fila; si la escritura de perfil falla se elimina la cuenta creada.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const message = createError?.message ?? "No se pudo crear la cuenta";
    if (/already|exists|registered/i.test(message)) return respuesta(409, { error: "Ya existe una cuenta con ese mail" });
    return respuesta(400, { error: message });
  }

  const { error: insertError } = await admin.from("usuario").insert({
    id_usuario: created.user.id,
    nombre_usuario: nombre,
    apellido_usuario: apellido,
    fecha_nacimiento_usuario: fecha,
    dni_usuario: dni,
    telefono_usuario: telefono,
    mail_usuario: email,
    rol_usuario: rol,
    activo: true,
  });
  if (insertError) {
    const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
    if (rollbackError) {
      return respuesta(500, { error: "No se pudo guardar el usuario ni revertir su cuenta de Auth. Contactá al administrador con el mail ingresado." });
    }
    if (insertError.code === "23505") {
      if (insertError.message.toLowerCase().includes("dni")) return respuesta(409, { error: "Ya existe un usuario con ese DNI" });
      return respuesta(409, { error: "Ya existe una cuenta con ese mail" });
    }
    return respuesta(400, { error: insertError.message });
  }

  return respuesta(201, { ok: true, id_usuario: created.user.id });
});
