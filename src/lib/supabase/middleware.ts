import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";

const RUTAS_PUBLICAS = ["/login"];

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
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
