# KineSys — sistema de gestión

Consultorio de kinesiología (trabajo de facultad). Backend: **Supabase** (Postgres + Auth). Frontend: **Next.js 15 App Router + TypeScript + React 19**.

Hoy solo existe la **base de acceso**: login, sesión e inicio protegido. No hay módulos de turnos, pacientes, profesionales, pagos ni indicadores.

Los pacientes usan otra web. **No pueden entrar acá.** Roles de este sistema: `Gerente`, `Profesional`, `Mesa de Entradas`.

El enrutamiento y el login/logout copian el ERP Palacio de las Golosinas (`erp-epg`), en TypeScript.

---

## Regla de arquitectura (obligatoria)

El frontend **no consulta tablas**. Solo:

1. Validar parámetros (obligatorios, mail, tipos, longitudes).
2. Invocar el servidor.

Permitido:

- Auth: `signInWithPassword`, `signOut`, `getUser` / `getSession`
- `supabase.rpc("fn_...", { ... })`
- Edge functions: `supabase.functions.invoke("nombre", { body })` (todavía no hay ninguna en uso)

Prohibido en cualquier archivo del front:

- `supabase.from("tabla")` (select/insert/update/delete)
- Lógica de negocio o permisos en el cliente

Las reglas viven en funciones `fn_*`. El front muestra el resultado o el `error.message` de la función.

---

## Stack y conectores

| Pieza | Uso |
|---|---|
| Next.js 15 App Router | Rutas, server actions, layouts |
| `@supabase/supabase-js` | Auth + RPC |
| `@supabase/ssr` | Sesión en cookies (como el ERP) |
| CSS en `src/app/globals.css` | Sin Tailwind, sin librerías de UI |

No agregar libs de formularios, UI ni estado.

### Clientes Supabase

- `src/lib/supabase/env.ts` — URL + clave publicable
- `src/lib/supabase/server.ts` — server actions y Server Components
- `src/lib/supabase/client.ts` — navegador (el login no lo usa)
- `src/lib/supabase/middleware.ts` — refresca sesión y protege rutas

Proyecto: `https://dbfehkykxsqgpctskuuq.supabase.co`

Env (`.env.local`, **nunca commitear**; `.env.example` solo nombres):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Nunca usar `service_role` en el front.

---

## Auth y RPC

No hay `app/api/...`. Todo va por el SDK.

Server actions (como el ERP):

- `src/app/(auth)/login/actions.ts` → `login`
  1. `validarLogin`
  2. `signInWithPassword`
  3. `rpc("fn_acceso_gestion")`
  4. Si no puede entrar: `signOut` + mensaje
  5. Si puede: `redirect("/")`
- `src/app/(auth)/logout/actions.ts` → `logout` → `signOut` + `redirect("/login")`

El botón de salir es `<form action={logout}>` (`LogoutButton`).

`src/lib/auth.ts`: validación + `obtenerUsuarioGestion()`.

### `fn_acceso_gestion`

- Sin parámetros (usa `auth.uid()`).
- OK: `{ id_usuario, nombre_usuario, apellido_usuario, rol_usuario }` (primera fila del array).
- Error: `No autenticado` o `No tenés permiso para acceder al sistema de gestión`.
- Entra si existe en `usuario`, `activo = true` y rol Gerente / Profesional / Mesa de Entradas.
- SQL de referencia: `supabase/migrations/001_fn_acceso_gestion.sql` (el front no lo ejecuta).

Mensajes de login:

- Mail vacío / inválido / sin contraseña → validación, sin pegarle a Auth
- Auth falla → `Mail o contraseña incorrectos`
- Paciente u otro rol → mensaje de la función y **sin sesión abierta**

---

## Enrutamiento

Grupos de Next (no aparecen en la URL), estilo ERP:

```
src/
  app/
    (auth)/login            → /login
    (auth)/logout/actions
    (main)/                 → /   (protegido)
    dashboard/              → /dashboard redirige a /
  proxy.ts + middleware.ts  → Next 15 carga middleware; la lógica está en proxy
```

Módulos nuevos: carpetas hermanas **dentro de `(main)/`**.

El proxy:

- Debe dejar pasar `/_next`, CSS, JS y el logo. Si no, el login queda sin estilos (ya pasó).
- Sin usuario + ruta privada → `/login`
- Usuario en `/login` **y** `fn_acceso_gestion` OK → `/`
- `(main)/layout.tsx` vuelve a chequear por RPC

---

## UI

Paleta:

- `#0066A1` azul principal
- `#358BC4` celeste
- `#F7FAFC` fondo
- `#123B5D` azul oscuro
- `#586770` gris texto

Logo: `public/logo-kinesys.svg`. Código simple, comentado, estilo estudiante. `"use client"` solo donde hay estado o `useActionState`.

---

## Cómo correrlo

```bash
npm install
npm run dev
```

`http://localhost:3000`. Cuentas de prueba (contraseñas las tiene el equipo, no van en el código):

| Mail | Resultado |
|---|---|
| joseodriozolarieszer@gmail.com | Entra (Gerente) |
| carlaperez@gmail.com | Entra (Mesa de Entradas) |
| pedroramirez@gmail.com | Entra (Profesional) |
| juanrodriguez@gmail.com | Rechazado (Paciente) |

---

## Fuera de alcance (todavía)

- Web de pacientes
- Turnos, pacientes, kinesiología, historia clínica, configuración, pagos, indicadores
- Alta de usuarios: edge function `crear-usuario`, solo Gerente
- RLS cerrado (hoy las policies están abiertas a propósito)

---

## Al implementar

- No uses `supabase.from`.
- Auth y sesión: server actions + `@supabase/ssr`, no `useEffect` + cliente browser para el login.
- No subas `.env.local`.
- No rompas el matcher/proxy: los estáticos no se redirigen a `/login`.
- `grep` de `.from(` en `src/` debe dar **cero** resultados.
