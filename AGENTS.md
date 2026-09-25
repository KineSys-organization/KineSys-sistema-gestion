# KineSys — sistema de gestión

Consultorio de kinesiología (trabajo de facultad). Backend: **Supabase** (Postgres + Auth). Frontend: **Next.js 15 App Router + TypeScript + React 19**.

Hoy existe la **base de acceso** (login, sesión e inicio protegido), módulos de Gerente (**Servicios**, **Profesionales** con franjas HU-02B) y recepción (**Pacientes**, **Disponibilidad**, **Otorgar turno** HU-06, **Agenda** HU-07, **Cancelar turno** HU-10A), módulo del Profesional (**Mi agenda** HU-12 y **Registrar atención** HU-13), con control de acceso por rol (HU-08). Pagos e indicadores siguen pendientes.

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

`src/lib/auth/index.ts`: validación + `obtenerUsuarioGestion()`, `exigirGerente()`, `exigirRecepcion()` (Gerente o Mesa de Entradas) para páginas y `exigirAccion(accion)` para server actions.

`src/lib/auth/permisos.ts`: matriz de permisos (HU-08) con `puedeAcceder(rol, ruta)` y `puedeHacer(rol, accion)`. Lógica pura, testeada en `tests/hu08-acceso.test.mjs`.

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
    (main)/profesionales/[id]/editar
    (main)/profesionales/[id]/horarios
    (main)/pacientes
    (main)/pacientes/nuevo
    (main)/pacientes/[id]
    (main)/disponibilidad     → "Otorgar turno" paso 1: calendario de 30 días
    (main)/agenda
    (main)/turnos/nuevo
    (main)/turnos/[id]       → resumen + cancelar (HU-10A)
    (main)/mi-agenda         → agenda propia del Profesional (HU-12)
    (main)/mi-agenda/[id]    → paciente del turno + registrar/editar atención (HU-13)
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

> Al 24/09/2026 `pedroramirez@gmail.com` no existe en Auth: el único Profesional activo con franjas es `luciafernandez@gmail.com` (la contraseña la tiene el equipo; se cambió el 24/09 para probar HU-12/13).

---

## Fuera de alcance (todavía)

- Web de pacientes (login del paciente)
- Historia clínica, pagos, indicadores
- Alta de usuarios genérica `crear-usuario` (el alta de profesional usa `crear-profesional`)
- Administración del catálogo de obras sociales desde la app
- RLS cerrado en tablas históricas (las nuevas de HU-04 van con RLS + revoke; el acceso es solo por `fn_*`)

### HU-01 / HU-02A / HU-02B / HU-03

- Servicios: `fn_listar_servicios`, `fn_registrar_servicio`, `fn_editar_servicio`, `fn_desactivar_servicio`. Solo Gerente muta; listar lo pueden otros roles de gestión.
- Profesionales (HU-02A): `fn_listar_profesionales` y edge `crear-profesional`. El alta exige al menos un servicio **antes** de invocar la edge. Pantallas solo Gerente.
- Horarios de profesionales (HU-02B): `fn_consultar_horarios_profesional` y `fn_registrar_franja_profesional`. Franjas horarias semanales recurrentes por día de la semana. Exige al menos un servicio asociado. Restricción `EXCLUDE` (GiST) en PostgreSQL para evitar solapamientos. Pantallas solo Gerente.
- Edición y disponibilidad de profesionales (HU-03): `fn_obtener_profesional`, `fn_editar_profesional`, `fn_alternar_estado_profesional`, `fn_editar_franja_profesional` y `fn_eliminar_franja_profesional`. Edición precargada de datos personales, matrícula y servicios; mail actual de solo lectura. Quitar servicios requiere no tener turnos confirmados pendientes y aceptar el aviso; admite cero servicios en edición. Activación/desactivación conserva turnos. Cambiar/eliminar franjas permite guardar, conserva los turnos e informa los afectados antes y después. Migración 006, con prevención de solapamientos GiST. Pantallas solo Gerente.

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
- Calcula slots = franjas del día × duración/granularidad del servicio − turnos `confirmado` (antes `otorgado`, cambiado en HU-06). Un turno `cancelado` (HU-10A) no ocupa.
- No horarios pasados; ventana máxima 30 días; solo profesional activo con servicio asociado.
- Tabla mínima `turno` (ocupación). El alta de turnos es HU-06.
- Cada horario libre es un link a `/turnos/nuevo` (HU-06).
- SQL: `supabase/migrations/004_hu05_disponibilidad.sql`.

### HU-06 — Otorgar turno

- Pantallas: `/turnos/nuevo?profesional&servicio&fecha&hora` (buscar paciente → cobertura → confirmar) y `/turnos/[id]` (resumen). Solo **Gerente** y **Mesa de Entradas**.
- RPCs: `fn_otorgar_turno(paciente, profesional, servicio, fecha, hora, obra_social)` y `fn_obtener_turno(id)`.
- Estado del turno: `confirmado` (también `cancelado`, `ausente` y, desde HU-13, `atendido`).
- Concurrencia: al confirmar se revalida el horario (lock por profesional+día + `fn_consultar_disponibilidad`). Restricción `EXCLUDE` (GiST) `turno_sin_superposicion` como última defensa. Error: *El horario seleccionado ya no está disponible*.
- No se otorgan turnos en fecha/hora pasada.
- Cobertura: `turno.id_obra_social` (null = Particular) + `numero_afiliado` guardado al otorgar. Tiene que ser una obra del paciente. Una sola obra → preseleccionada; varias → Recepción elige; siempre se puede elegir Particular.
- SQL: `supabase/migrations/005_hu06_otorgar_turno.sql`. Pruebas: `supabase/tests/hu06_turnos.sql` y `tests/turnos.test.mjs` (`npm test`). Evidencia en `docs/hu-06-otorgar-turno.md`.

### HU-07 — Consultar agenda del profesional

- Pantalla: `/agenda`. Solo **Gerente** y **Mesa de Entradas**.
- RPC: `fn_consultar_agenda_profesional(profesional, fecha)`.
- Muestra los turnos `confirmado` y `cancelado` (este último desde HU-10A, identificado y con su motivo) del profesional para la fecha, ordenados por horario, con paciente, DNI, servicio, horario, estado y link a `/turnos/[id]`.
- Una fecha sin turnos se muestra vacía, sin error.
- SQL: `supabase/migrations/007_hu07_agenda_profesional.sql`. Pruebas: `tests/agenda.test.mjs` (`npm test`).

### HU-08 — Autenticación y acceso interno

- Matriz: Inicio todos; `/servicios` Gerente + Mesa de Entradas (**solo lectura** para Mesa); `/profesionales/*` solo Gerente; pacientes, disponibilidad, agenda y turnos Gerente + Mesa de Entradas; `/mi-agenda/*` solo Profesional (HU-12/13, `exigirProfesional`).
- Defensa en 3 capas: página (`exigirGerente` / `exigirRecepcion`, sin permiso → `/?error=sin-permiso` con aviso en Inicio), server action (`exigirAccion`) y RPC (`fn_*` valida rol con usuario activo).
- `fn_exigir_rol(text[])` (interna, revocada a `authenticated`): exige usuario activo con uno de los roles; un `NULL` siempre se rechaza. Reemplaza a `rol_actual()` en las funciones de servicios y `fn_listar_profesionales`. Mensaje: *No tenés permisos para realizar esta acción*.
- Menú y tarjetas de Inicio se filtran con `puedeAcceder` (solo UX). El header muestra "Nombre Apellido · Rol".
- SQL: `supabase/migrations/008_hu08_control_acceso.sql`. Pruebas: `supabase/tests/hu08_control_acceso.sql` y `tests/hu08-acceso.test.mjs` (`npm test`). Evidencia en `docs/hu-08-autenticacion-acceso.md`.

### HU-10A — Cancelar un turno

- Desde `/turnos/[id]` (botón "Cancelar turno" solo si `cancelable`: confirmado y no pasó). Solo **Gerente** y **Mesa de Entradas** (acción `turnos.cancelar`).
- RPC: `fn_cancelar_turno(turno, motivo, detalle)`. Motivos: `pedido_paciente`, `profesional`, `otro` (etiquetas en `MOTIVOS_CANCELACION`). Detalle opcional ≤ 200.
- No borra: pasa a `cancelado` con `motivo_cancelacion`, `detalle_cancelacion`, `cancelado_en`, `cancelado_por`. Usa el mismo lock y la misma hora de Argentina que `fn_otorgar_turno`.
- Errores: ya cancelado, ya ausente, *El turno ya pasó; corresponde marcarlo como Ausente*, sin motivo.
- `fn_obtener_turno` suma los datos de cancelación y `cancelable`. La agenda (HU-07) muestra también los cancelados.
- SQL: `supabase/migrations/009_hu10a_cancelar_turno.sql`. Pruebas: `supabase/tests/hu10a_cancelar_turno.sql` y `tests/hu10a-cancelar-turno.test.mjs` (`npm test`). Evidencia en `docs/hu-10a-cancelar-turno.md`.

### HU-12 / HU-13 — Mi agenda y registrar la atención (Profesional)

- Pantallas: `/mi-agenda?fecha=` (hoy por defecto, día anterior/siguiente) y `/mi-agenda/[id]` (paciente del turno + atención). Solo **Profesional** (`exigirProfesional`, acciones `atencion.agenda` y `atencion.registrar`).
- Quién es el profesional: `turno.id_profesional = profesional.id_usuario = auth.uid()`. El front nunca manda el id del profesional desde el request; lo toma de la sesión y la base lo vuelve a exigir.
- HU-12 reutiliza las RPC de HU-06/HU-07: `fn_consultar_agenda_profesional` (Recepción igual que antes; un Profesional solo con su propio id → *Solo podés consultar tu propia agenda*) y `fn_obtener_turno` (un Profesional solo sus turnos → *El turno no existe o no pertenece a tu agenda*, mismo mensaje si no existe). Suman `atendible` (confirmado y del día, hora de Argentina), datos del paciente (fecha de nacimiento, teléfono) y la `atencion` (solo para el profesional que atendió; Recepción no ve observaciones clínicas).
- HU-13: tabla `atencion` (una por turno, `unique(id_turno)`; fecha, profesional y paciente se copian del turno; observaciones 1..2000; `motivo_consulta` opcional ≤ 200; `registrado_en`, `editado_en`), con RLS y sin grants. `fn_registrar_atencion(turno, observaciones, motivo)` exige turno propio, confirmado y del día, y pasa el turno a **`atendido`**. Registrar de nuevo → *La atención de este turno ya fue registrada…*. `fn_editar_atencion` es la edición explícita (botón "Editar atención"): solo observaciones y motivo.
- Helper interno `fn_exigir_turno_propio(uuid)` (revocado a `authenticated`).
- Efectos en lo existente: `turno_estado_valido` suma `atendido`; un turno atendido sigue ocupando su horario (`turno_sin_superposicion` y `fn_consultar_disponibilidad` miran `confirmado` y `atendido`); `fn_cancelar_turno` rechaza atendidos; `/agenda` y `/turnos/[id]` muestran el estado Atendido.
- SQL: `supabase/migrations/010_hu12_hu13_atencion.sql`. Pruebas: `supabase/tests/hu12_hu13_atencion.sql` y `tests/hu12-hu13-atencion.test.mjs` (`npm test`). Evidencia en `docs/hu-12-13-atencion.md`.

### Mejoras de UX/UI (menú, otorgar turno, calendario, filtros)

- Menú: cliente (`usePathname`) para marcar la sección activa. "Otorgar turno" apunta a `/disponibilidad` (paso 1).
- `/disponibilidad`: calendario de 30 días (`fn_consultar_disponibilidad_calendario`) + horarios del día; estado en la URL (`?profesional&servicio&fecha`, helper `urlDisponibilidad`). Pasos con `PasosTurno`.
- `/agenda`: profesional y fecha en la URL (sin `useActionState`).
- `/pacientes`: listado con filtros (`fn_filtrar_pacientes`: texto, obra social o particular, rango etario). `fn_buscar_pacientes` sigue para el paso 2 de otorgar.
- Alta de paciente con `?volver=` (solo `/turnos/nuevo`, `urlVolverTurno`) → vuelve al turno con el paciente elegido.
- Botones de acción: `boton-principal` / `boton-secundario` (+ `boton-peligro`) con `boton-inline` = 44px. Fila de acciones al pie: `acciones-pie`.
- SQL: `supabase/migrations/011_mejoras_pacientes_calendario.sql`. Pruebas: `tests/mejoras-ux.test.mjs`. Detalle en `docs/mejoras-ux.md`.

---

## Al implementar

- No uses `supabase.from`.
- Auth y sesión: server actions + `@supabase/ssr`, no `useEffect` + cliente browser para el login.
- No subas `.env.local`.
- No rompas el matcher/proxy: los estáticos no se redirigen a `/login`.
- `grep` de `.from(` en `src/` debe dar **cero** resultados.
- Página nueva en `(main)/`: sumar su ruta a `src/lib/auth/permisos.ts` y llamar `exigirGerente()` / `exigirRecepcion()`. Server action nueva: empezar con `exigirAccion(...)`. Si no, `npm test` falla.
- `fn_*` nueva: validar rol con usuario activo (`fn_exigir_rol` o `fn_es_recepcion`), nunca con `rol_actual()` (deja pasar `NULL`).
- Entrega por **PR** a `main` (revisión del equipo). No pushear directo a `main`.
