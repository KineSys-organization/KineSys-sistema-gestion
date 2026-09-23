# KineSys — sistema de gestión

Consultorio de kinesiología (trabajo de facultad). Backend: **Supabase** (Postgres + Auth). Frontend: **Next.js 15 App Router + TypeScript + React 19**.

Hoy existe la **base de acceso** (login, sesión e inicio protegido), módulos de Gerente (**Servicios**, **Profesionales** con franjas HU-02B) y recepción (**Pacientes**, **Disponibilidad**, **Otorgar turno** HU-06). Cancelar turnos, pagos e indicadores siguen pendientes.

Los pacientes **no inician sesión en esta web** (usan otra). Acá Recepción los registra para otorgar turnos. Roles de este sistema: `Gerente`, `Profesional`, `Mesa de Entradas`.

El enrutamiento y el login/logout copian el ERP Palacio de las Golosinas (`erp-epg`), en TypeScript.

---

## Regla de arquitectura (obligatoria)

El frontend **no consulta tablas**. Solo:

1. Validar parámetros (obligatorios, mail, tipos, longitudes).
2. Invocar el servidor.

Permitido:

- Auth: `signInWithPassword`, `signOut`, `getUser` / `getSession`
- `supabase.rpc("fn_...", { ... })`
- Edge functions: `supabase.functions.invoke("nombre", { body })` — en uso: `crear-profesional`

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

`src/lib/auth.ts`: validación + `obtenerUsuarioGestion()`, `exigirGerente()`, `exigirRecepcion()` (Gerente o Mesa de Entradas).

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
    (main)/servicios
    (main)/profesionales
    (main)/profesionales/nuevo
    (main)/profesionales/[id]/horarios
    (main)/pacientes
    (main)/pacientes/nuevo
    (main)/pacientes/[id]
    (main)/disponibilidad
    (main)/turnos/nuevo
    (main)/turnos/[id]
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
npm test        # tests unitarios (tsx --test, funciona en cualquier Node)
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

- Web de pacientes (login del paciente)
- Cancelar turnos (HU-10A)
- Editar profesional y activo/inactivo (HU-03)
- Historia clínica, pagos, indicadores
- Alta de usuarios genérica `crear-usuario` (el alta de profesional usa `crear-profesional`)
- Administración del catálogo de obras sociales desde la app
- RLS cerrado en tablas históricas (las nuevas de HU-04 van con RLS + revoke; el acceso es solo por `fn_*`)

### HU-01 / HU-02A / HU-02B

- Servicios: `fn_listar_servicios`, `fn_registrar_servicio`, `fn_editar_servicio`, `fn_desactivar_servicio`. Solo Gerente muta; listar lo pueden otros roles de gestión.
- Profesionales (HU-02A): `fn_listar_profesionales` y edge `crear-profesional`. El alta exige al menos un servicio **antes** de invocar la edge. Pantallas solo Gerente.
- Horarios de profesionales (HU-02B): `fn_consultar_horarios_profesional` y `fn_registrar_franja_profesional`. Franjas horarias semanales recurrentes por día de la semana. Exige al menos un servicio asociado. Restricción `EXCLUDE` (GiST) en PostgreSQL para evitar solapamientos. Pantallas solo Gerente.

### HU-04 — Pacientes

- Pantallas: `/pacientes` (buscar), `/pacientes/nuevo`, `/pacientes/[id]` (editar). Solo **Gerente** y **Mesa de Entradas** (`exigirRecepcion`).
- Extiende la tabla **`paciente` ya existente** (no la recrea). Agrega `mail_paciente`, catálogo `obra_social` y `paciente_obra_social`.
- RPCs: `fn_listar_obras_sociales`, `fn_buscar_pacientes`, `fn_obtener_paciente`, `fn_registrar_paciente` (gestión), `fn_editar_paciente`.
- No tocar `fn_completar_registro_paciente` (web de pacientes).
- DNI y fecha de nacimiento **no** se editan después del alta.
- Obra social opcional; sin ninguna = particular. Varias obras con nº de afiliado; misma obra dos veces → rechazo.
- DNI duplicado → error que sugiere el paciente existente.
- SQL: `supabase/migrations/003_hu04_pacientes.sql`.

### HU-05 — Disponibilidad

- Pantalla: `/disponibilidad`. Solo **Gerente** y **Mesa de Entradas**.
- RPC: `fn_consultar_disponibilidad(profesional, servicio, fecha)`.
- Calcula slots = franjas del día × duración/granularidad del servicio − turnos `confirmado` (antes `otorgado`, cambiado en HU-06).
- No horarios pasados; ventana máxima 30 días; solo profesional activo con servicio asociado.
- Tabla mínima `turno` (ocupación). El alta de turnos es HU-06.
- Cada horario libre es un link a `/turnos/nuevo` (HU-06).
- SQL: `supabase/migrations/004_hu05_disponibilidad.sql`.

### HU-06 — Otorgar turno

- Pantallas: `/turnos/nuevo?profesional&servicio&fecha&hora` (buscar paciente → cobertura → confirmar) y `/turnos/[id]` (resumen). Solo **Gerente** y **Mesa de Entradas**.
- RPCs: `fn_otorgar_turno(paciente, profesional, servicio, fecha, hora, obra_social)` y `fn_obtener_turno(id)`.
- Estado del turno: `confirmado` (también `cancelado`, `ausente`).
- Concurrencia: al confirmar se revalida el horario (lock por profesional+día + `fn_consultar_disponibilidad`). Restricción `EXCLUDE` (GiST) `turno_sin_superposicion` como última defensa. Error: *El horario seleccionado ya no está disponible*.
- No se otorgan turnos en fecha/hora pasada.
- Cobertura: `turno.id_obra_social` (null = Particular) + `numero_afiliado` guardado al otorgar. Tiene que ser una obra del paciente. Una sola obra → preseleccionada; varias → Recepción elige; siempre se puede elegir Particular.
- SQL: `supabase/migrations/005_hu06_otorgar_turno.sql`. Pruebas: `supabase/tests/hu06_turnos.sql` y `tests/turnos.test.mjs` (`npm test`). Evidencia en `docs/hu-06-otorgar-turno.md`.

---

## Al implementar

- No uses `supabase.from`.
- Auth y sesión: server actions + `@supabase/ssr`, no `useEffect` + cliente browser para el login.
- No subas `.env.local`.
- No rompas el matcher/proxy: los estáticos no se redirigen a `/login`.
- `grep` de `.from(` en `src/` debe dar **cero** resultados.
- Entrega por **PR** a `main` (revisión del equipo). No pushear directo a `main`.
