import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";

const RUTAS_PUBLICAS = ["/login"];
// HU-23: ingreso del portal del paciente (no se importa de lib/portal para no cargar next/headers acá).
const RUTA_INGRESO_PORTAL = "/portal/ingresar";

function esArchivoEstatico(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(pathname)
  );
}

export async function updateSession(request: NextRequest) {
  if (esArchivoEstatico(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresca el token. No agregar lógica entre createServerClient y getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // HU-23: el portal del paciente tiene su propio ingreso y su propia función de acceso.
  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    const esIngreso = pathname.startsWith(RUTA_INGRESO_PORTAL);

    if (!user && !esIngreso) {
      const url = request.nextUrl.clone();
      url.pathname = RUTA_INGRESO_PORTAL;
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (user && esIngreso) {
      const { data, error } = await supabase.rpc("fn_acceso_paciente");
      if (!error && data) {
        const url = request.nextUrl.clone();
        url.pathname = "/portal";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    return supabaseResponse;
  }

  const esRutaPublica = RUTAS_PUBLICAS.some((ruta) => pathname.startsWith(ruta));

  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = ""; // no arrastrar parámetros de la ruta privada al login
    return NextResponse.redirect(url);
  }

  // Solo mandamos a / si la función de la base confirma que puede entrar.
  if (user && esRutaPublica) {
    const { data, error } = await supabase.rpc("fn_acceso_gestion");
    if (!error && data && data.length > 0) {
      const url = request.nextUrl.clone();
      url.pathname = data[0]?.rol_usuario === "Gerente" ? "/indicadores" : "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
