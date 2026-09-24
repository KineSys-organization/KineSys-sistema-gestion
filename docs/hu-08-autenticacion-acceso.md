# HU-08 — Autenticación y acceso interno

Rama: `feature/hu-08-acceso-interno`. Issue: #8. Depende de lo ya integrado en `main` (HU-01 a HU-07).

## Criterios de aceptación

| # | Criterio | Estado | Dónde se cubre |
|---|---|---|---|
| 1 | Usuario válido de cualquiera de los tres roles inicia sesión → se lo autentica y se reconoce su rol | ✅ | `login` + `fn_acceso_gestion` (ya existían). HU-08 agrega "Nombre Apellido · Rol" en el header |
| 2 | Mesa de Entradas accede a pacientes, otorgar turnos, disponibilidad y agenda (y ve servicios en solo lectura) | ✅ | Matriz `permisos.ts` + `exigirRecepcion` + `fn_es_recepcion` |
| 3 | Gerente accede a configuración (servicios, profesionales, horarios) y a todo lo de Recepción | ✅ | `exigirGerente` + `fn_exigir_rol(['Gerente'])` / chequeos de HU-02B y HU-03 |
| 4 | Una acción no permitida para el rol → se bloquea | ✅ | 3 capas: página, server action, RPC (ver abajo) |
| 5 | No autenticado en un área protegida → `/login` | ✅ | Middleware (`src/lib/supabase/middleware.ts`) + `(main)/layout.tsx` |

## Matriz de permisos

Fuente única en el front: `src/lib/auth/permisos.ts` (`puedeAcceder(rol, ruta)` y `puedeHacer(rol, accion)`).

| Ruta / acción | Gerente | Mesa de Entradas | Profesional |
|---|---|---|---|
| Inicio | ✅ | ✅ | ✅ |
| `/servicios` (listar) | ✅ | ✅ solo lectura | ❌ |
| `/servicios` alta / edición / baja | ✅ | ❌ | ❌ |
| `/profesionales`, `nuevo`, `[id]/editar`, `[id]/horarios` | ✅ | ❌ | ❌ |
| `/pacientes`, `nuevo`, `[id]` | ✅ | ✅ | ❌ |
| `/disponibilidad`, `/agenda`, `/turnos/*` | ✅ | ✅ | ❌ |

Paciente (y cualquier cuenta sin rol de gestión): no entra (`fn_acceso_gestion` lo rechaza y se cierra la sesión).

**Decisiones tomadas con el equipo al auditar:**

- **A.** Mesa de Entradas **sí** ve `/servicios`, en solo lectura (antes la página era solo Gerente). El panel oculta el formulario y los botones de editar/desactivar.
- **B.** `fn_listar_servicios` y `fn_listar_profesionales` **siguen permitiendo al Profesional** (lectura, como decía `AGENTS.md`). El Profesional no tiene pantallas que las usen; en el front sus actions lo bloquean igual.
- **C.** La edge function `crear-profesional` valida rol Gerente pero **no mira `usuario.activo`**. No está en el repo, así que queda documentado como pendiente. El alta pasa antes por la server action `crearProfesional`, que exige Gerente activo.

## Auditoría (estado antes de HU-08)

| Módulo | Página | Server action | RPC |
|---|---|---|---|
| Servicios | `exigirGerente` (Mesa no entraba) | sin chequeo | `rol_actual()`: **no mira `activo` y deja pasar `NULL`** |
| Profesionales | `exigirGerente` ✅ | sin chequeo | `fn_listar_profesionales` con `rol_actual()` (mismo hueco); el resto Gerente activo ✅ |
| Horarios | `exigirGerente` ✅ | sin chequeo | Gerente activo ✅ |
| Pacientes | `exigirRecepcion` ✅ | sin chequeo | `fn_es_recepcion()` ✅ |
| Disponibilidad / Agenda / Turnos | `exigirRecepcion` ✅ | sin chequeo | `fn_es_recepcion()` ✅ |

El hueco de `rol_actual()`: `NULL not in (...)` es `NULL`, el `IF` no dispara y la función sigue. Una cuenta de Auth sin fila en `usuario` (por ejemplo alguien a mitad del registro en la web de pacientes) podía listar servicios y profesionales con DNI, teléfono y mail. Y un Gerente desactivado con el token todavía vigente podía modificar servicios.

## Capas de control

1. **Página (server component):** `exigirGerente()` / `exigirRecepcion()` al inicio. Sin sesión → `/login`. Rol que no alcanza → `/?error=sin-permiso`, e Inicio muestra *"No tenés permisos para realizar esta acción. Volviste al inicio."*
2. **Server action:** cada una de las 25 actions de `src/lib/*/actions.ts` empieza con `exigirAccion("modulo.accion")` (salvo `consultarDisponibilidad`, que delega en `obtenerDisponibilidad`). Una action se puede invocar por POST sin pasar por la página, por eso repite el chequeo. Devuelve el mensaje de error en el formulario; no redirige.
3. **RPC (Postgres):** cada `fn_*` valida el rol de `auth.uid()` con usuario activo. La migración 008 agrega `fn_exigir_rol(text[])` y la usan las 5 funciones que dependían de `rol_actual()`. Mensaje: *"No tenés permisos para realizar esta acción"*.

La navegación (menú del header y tarjetas de Inicio) filtra con `puedeAcceder`. Es solo UX: el bloqueo real está en las 3 capas.

`obtenerUsuarioGestion()` usa `cache` de React: layout, página y actions del mismo request comparten una sola llamada a `fn_acceso_gestion`.

## Middleware (criterio 5)

- Sin sesión + cualquier ruta de `(main)` → `307 /login`. Se limpia el query string para no arrastrar parámetros de la ruta privada.
- `/login` con sesión y `fn_acceso_gestion` OK → `/`.
- El matcher no se tocó: `/_next/static`, CSS, JS y el logo pasan sin redirección.

## Migración

`supabase/migrations/008_hu08_control_acceso.sql` (va después de 007, HU-07).

- `fn_exigir_rol(text[])`: `security definer`, `search_path = ''`, revocada para `public, anon, authenticated` (solo la llaman otras `fn_*`).
- `create or replace` de `fn_listar_servicios`, `fn_registrar_servicio`, `fn_editar_servicio`, `fn_desactivar_servicio` y `fn_listar_profesionales`: misma lógica, solo cambia el chequeo de rol. Los mensajes "Solo un Gerente puede…" pasan a "No tenés permisos para realizar esta acción".
- No toca `fn_completar_registro_paciente` ni `rol_actual()` (puede estar usado por políticas RLS).

**Aplicada** el 24/09/2026 con autorización del equipo, como `hu08_control_acceso` (versión `20260924151153`). Verificado después con consultas de solo lectura:

- Las 5 funciones usan `fn_exigir_rol(...)` y ninguna usa `rol_actual()`.
- Permisos: `authenticated` puede ejecutar las 5 funciones; `fn_exigir_rol` solo `postgres` y `service_role`.

## Pruebas

### Unitarias — `tests/hu08-acceso.test.mjs` (`npm test`)

- `puedeAcceder`: todas las celdas de la matriz para los 3 roles, subrutas, query string, prefijos parecidos (`/serviciosx`), rutas fuera de la matriz y roles inválidos (Paciente, vacío, `null`).
- `puedeHacer`: cada acción × cada rol, más Paciente y `null`.
- Sobre el código: cada `page.tsx` de `(main)` usa el `exigir*` que corresponde según la matriz, y cada server action llama a `exigirAccion`. Si alguien agrega una página o action sin chequeo, el test falla.

### SQL — `supabase/tests/hu08_control_acceso.sql`

Simula cada rol con `set local role authenticated` + `request.jwt.claims` y termina en `ROLLBACK`.

| Caso | Esperado |
|---|---|
| Gerente: alta, edición y baja de servicio; listar; profesionales; horarios; pacientes; agenda; otorgar turno (pasa el control) | OK |
| Mesa de Entradas: `fn_registrar/editar/desactivar_servicio`, `fn_editar_profesional`, `fn_registrar_franja_profesional` | Error de permisos |
| Mesa de Entradas: `fn_listar_servicios`, pacientes, agenda, otorgar turno | OK |
| Profesional: `fn_otorgar_turno`, `fn_buscar_pacientes`, `fn_registrar_servicio` | Error de permisos |
| Paciente (`juanrodriguez@`): `fn_acceso_gestion` | *No tenés permiso para acceder al sistema de gestión* |
| Cuenta sin fila en `usuario`: `fn_listar_servicios` / `fn_listar_profesionales` | Error de permisos (antes pasaba) |
| Sin sesión | *No autenticado* |
| Gerente desactivado con token vigente: `fn_registrar_servicio` | Error de permisos (antes pasaba) |

Cómo correrlo: después de aplicar 008, pegar el archivo en el SQL editor de Supabase. Si todo pasa muestra `HU-08 OK: ...`; si algo falla, corta con `FALLA: <caso>`.

> Cuentas: `pedroramirez@gmail.com` (la de Profesional en `AGENTS.md`) **no existe en Auth**. El único Profesional activo hoy es `luciafernandez@gmail.com`. El test toma el Profesional por rol, no por mail.

## Evidencia (24/09/2026)

**Unitarias:** `npm test` → `tests 35 · pass 35 · fail 0` (26 anteriores + 9 de HU-08).

**Build:** `npm run build` OK, `tsc --noEmit` sin errores.

**Arquitectura:** `grep -rn "\.from(" src/` → 0 resultados.

**Middleware** (`npm run start`, sin sesión, con `curl`):

| Pedido | Resultado |
|---|---|
| `/`, `/servicios`, `/profesionales`, `/profesionales/nuevo`, `/profesionales/x/editar`, `/profesionales/x/horarios`, `/pacientes`, `/pacientes/nuevo`, `/pacientes/x`, `/disponibilidad`, `/agenda`, `/turnos/nuevo?hora=10:00`, `/turnos/x`, `/?error=sin-permiso` | `307 → /login` (sin query string) |
| `POST /servicios` con header `Next-Action` (invocar una action sin sesión) | `307 → /login` |
| `/login`, `/logo-kinesys.svg`, CSS de `/_next/static` | `200` (con estilos) |

**SQL:** pendiente de correr en el editor SQL de Supabase. El conector de solo lectura no tiene EXECUTE sobre las `fn_*` ni puede hacer `SET ROLE authenticated`, así que desde ahí no se puede ejecutar.

**Prueba manual por rol:** pendiente, la corre el equipo (las contraseñas no están en el repo).

| Cuenta | Qué verificar | Resultado |
|---|---|---|
| Gerente (`joseodriozolarieszer@`) | Header "Nombre Apellido · Gerente". Menú: Inicio, Pacientes, Disponibilidad, Agenda, Profesionales, Servicios. Alta/edición/baja de servicio funciona | ☐ |
| Mesa de Entradas (`carlaperez@`) | Header "· Mesa de Entradas". Menú sin Profesionales. `/servicios` en solo lectura (sin formulario ni botones). Escribir `/profesionales` en la URL → vuelve a Inicio con el aviso rojo | ☐ |
| Profesional (`luciafernandez@`) | Header "· Profesional". Menú solo Inicio, sin tarjetas. `/pacientes`, `/servicios`, `/turnos/nuevo` por URL → Inicio con aviso | ☐ |
| Paciente (`juanrodriguez@`) | En `/login`: "No tenés permiso para acceder al sistema de gestión", sin sesión abierta | ☐ |
| Sin sesión | Cualquier ruta privada → `/login` | ✅ (curl, arriba) |

## Archivos

- `src/lib/auth/permisos.ts` (nuevo): matriz, `puedeAcceder`, `puedeHacer`.
- `src/lib/auth/index.ts` (antes `src/lib/auth.ts`): `exigirAccion`, redirección con aviso, `cache`.
- `src/lib/*/actions.ts`: chequeo de rol en las 25 actions.
- `src/app/(main)/page.tsx`: aviso `sin-permiso` y tarjetas según la matriz.
- `src/app/(main)/servicios/page.tsx` + `ServiciosPanel.tsx`: modo solo lectura.
- `src/components/BarraGestion.tsx`, `Navegacion.tsx`: rol en el header y menú según la matriz.
- `src/lib/supabase/middleware.ts`: limpia el query string al redirigir.
- `supabase/migrations/008_hu08_control_acceso.sql`, `supabase/tests/hu08_control_acceso.sql`, `tests/hu08-acceso.test.mjs`.
