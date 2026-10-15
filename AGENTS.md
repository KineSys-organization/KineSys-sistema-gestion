# KineSys — sistema de gestión

Consultorio de kinesiología (trabajo de facultad). Backend: **Supabase** (Postgres + Auth). Frontend: **Next.js 15 App Router + TypeScript + React 19**.

Hoy existe la **base de acceso** (login, sesión e inicio protegido), módulos de Gerente (**Servicios**, **Profesionales** con franjas HU-02B, **Personal interno** HU-29/HU-30, **Obras sociales** HU-31/HU-32, **Indicadores generales** HU-26 en su vista corta del Incremento 2) y recepción (**Pacientes**, **Disponibilidad**, **Otorgar turno** HU-06 con el paciente primero HU-28, **Agenda** HU-07, **Cancelar turno** HU-10A, **Marcar ausencia** HU-10B, **Reprogramar** HU-10C, **Turnos** HU-09, **Repetir semanalmente** HU-25, **Pagos** HU-14 con reembolsos HU-22 y billetera virtual HU-21, **Estado de cobro** HU-17, **Comprobante de pago** HU-35, **Prioridad del turno** HU-20), módulo del Profesional (**Mi agenda** HU-12, **Registrar atención** HU-13 con orden médica HU-24A/HU-38, **Historial de órdenes** HU-24B, **Dashboard** en Inicio HU-15 e **Historia clínica** HU-39), con control de acceso por rol (HU-08). El resto de los indicadores sigue pendiente.

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
    (main)/                 → /   (protegido; al Profesional le muestra su dashboard, HU-15)
    (main)/servicios
    (main)/obras-sociales       → catálogo de obras sociales (HU-31/HU-32, solo Gerente)
    (main)/profesionales
    (main)/profesionales/nuevo
    (main)/profesionales/[id]/editar
    (main)/profesionales/[id]/horarios
    (main)/usuarios           → personal interno: listado (mismo layout que profesionales)
    (main)/usuarios/nuevo     → alta Gerente / Mesa de Entradas (HU-29)
    (main)/usuarios/[id]/editar → editar / rol / estado (HU-30)
    (main)/pacientes
    (main)/pacientes/nuevo
    (main)/pacientes/[id]
    (main)/disponibilidad     → "Otorgar turno" pasos 2 y 3 (HU-28): profesional/servicio + calendario de 30 días; exige ?paciente
    (main)/agenda
    (main)/turnos             → listado con filtros y paginación (HU-09)
    (main)/turnos/nuevo       → "Otorgar turno" paso 1 (paciente) y pasos 4-5 (cobertura y confirmar)
    (main)/turnos/[id]       → resumen + cancelar (HU-10A) + repetir (HU-25) + ausencia (HU-10B) + pago (HU-14)
    (main)/turnos/[id]/reprogramar → nuevo día y horario del mismo turno (HU-10C)
    (main)/mi-agenda         → agenda propia del Profesional (HU-12)
    (main)/mi-agenda/[id]    → paciente del turno + registrar/editar atención (HU-13) con orden médica (HU-24A / HU-38)
    (main)/mi-agenda/[id]/ordenes → historial de órdenes médicas del paciente del turno (HU-24B)
    (main)/historia-clinica/[paciente] → ficha clínica + evolución del paciente (HU-39, solo Profesional)
    (main)/indicadores       → indicadores generales del centro (HU-26, solo Gerente)
    (main)/pagos             → listado de pagos con filtros (HU-14)
    (main)/turnos/[id]/pago  → registrar, consultar y corregir el pago del turno (HU-14)
    (main)/pagos/[id]/comprobante → comprobante del pago, ver y descargar PDF (HU-35; [id] = id_pago)
  proxy.ts + middleware.ts  → Next 15 carga `src/middleware.ts`; la sesión se refresca en `src/lib/supabase/middleware.ts`
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
- Pagos parciales, facturación fiscal (AFIP/ARCA), facturar a la obra social, resto de los indicadores (HU-18)
- Alta de usuarios genérica `crear-usuario` (el alta de profesional usa `crear-profesional`)
- RLS cerrado en tablas históricas (las nuevas de HU-04 van con RLS + revoke; el acceso es solo por `fn_*`)

### HU-01 / HU-02A / HU-02B / HU-03

- Servicios: `fn_listar_servicios`, `fn_registrar_servicio`, `fn_editar_servicio`, `fn_desactivar_servicio`. Solo Gerente muta; listar lo pueden otros roles de gestión.
- Profesionales (HU-02A): `fn_listar_profesionales` y edge `crear-profesional`. El alta exige al menos un servicio **antes** de invocar la edge. Pantallas solo Gerente.
- Horarios de profesionales (HU-02B): `fn_consultar_horarios_profesional` y `fn_registrar_franja_profesional`. Franjas horarias semanales recurrentes por día de la semana. Exige al menos un servicio asociado. Restricción `EXCLUDE` (GiST) en PostgreSQL para evitar solapamientos. Pantallas solo Gerente. El alta carga la misma franja en varios días a la vez (casillas + atajos "Lunes a viernes"/"Todos") con `fn_registrar_franjas_profesional(profesional, dias[], inicio, fin)`: todo o nada, el error dice qué día se superpone. La edición sigue siendo de a una franja. SQL: `supabase/migrations/012_franjas_varios_dias.sql`; pruebas: `supabase/tests/franjas_varios_dias.sql` y `tests/horarios.test.mjs`.
- Edición y disponibilidad de profesionales (HU-03): `fn_obtener_profesional`, `fn_editar_profesional`, `fn_alternar_estado_profesional`, `fn_editar_franja_profesional` y `fn_eliminar_franja_profesional`. Edición precargada de datos personales, matrícula y servicios; mail actual de solo lectura. Quitar servicios requiere no tener turnos confirmados pendientes y aceptar el aviso; admite cero servicios en edición. Activación/desactivación conserva turnos. Cambiar/eliminar franjas permite guardar, conserva los turnos e informa los afectados antes y después. Migración 006, con prevención de solapamientos GiST. Pantallas solo Gerente.

### HU-29 / HU-30 — Personal interno (Gerente y Mesa de Entradas)

- Pantallas: `/usuarios` (listado, mismo patrón que profesionales), `/usuarios/nuevo` (alta HU-29) y `/usuarios/[id]/editar` (HU-30). Solo **Gerente** (`exigirGerente`, acción `usuarios.gestionar`). No se mezcla con `/profesionales`.
- Alta: edge `crear-usuario-gestion` (Auth + fila `usuario`, rol Gerente o Mesa). Listado: `fn_listar_usuarios_gestion`.
- Edición (HU-30): `fn_obtener_usuario_gestion`, `fn_editar_usuario_gestion` (nombre, apellido, teléfono), `fn_cambiar_rol_usuario_gestion` y `fn_cambiar_estado_usuario_gestion` (`p_activo` explícito). Mail, DNI y fecha de nacimiento de solo lectura. Flags `es_usuario_actual` / `es_ultimo_gerente_activo` para deshabilitar en UI; la base igual bloquea.
- No se borra la cuenta de Auth. Inactivo no entra (`fn_acceso_gestion`). Tiene que quedar **al menos un Gerente activo**.
- SQL (ya aplicada en el proyecto): `supabase/migrations/021_gestion_usuarios_gestion_editar_rol_estado.sql`. Pruebas de validación: `tests/usuarios-gestion.test.mjs`. Evidencia en `docs/hu-30-usuarios-gestion.md`.

### HU-04 — Pacientes

- Pantallas: `/pacientes` (buscar), `/pacientes/nuevo`, `/pacientes/[id]` (editar). Solo **Gerente** y **Mesa de Entradas** (`exigirRecepcion`).
- Extiende la tabla **`paciente` ya existente** (no la recrea). Agrega `mail_paciente`, catálogo `obra_social` y `paciente_obra_social`.
- RPCs: `fn_listar_obras_sociales`, `fn_buscar_pacientes`, `fn_obtener_paciente`, `fn_registrar_paciente` (gestión), `fn_editar_paciente`.
- No tocar `fn_completar_registro_paciente` (web de pacientes).
- DNI y fecha de nacimiento **no** se editan después del alta.
- Obra social opcional; sin ninguna = particular. Varias obras con nº de afiliado; misma obra dos veces → rechazo.
- DNI duplicado → error que sugiere el paciente existente.
- SQL: `supabase/migrations/003_hu04_pacientes.sql`.

### HU-31 — Catálogo de obras sociales

- Pantalla `/obras-sociales`, solo Gerente (`exigirGerente`); permite registrar y listar nombre y estado.
- Alta con nombre recortado de espacios y longitud de 2 a 80 caracteres. La base rechaza duplicados ignorando mayúsculas y espacios periféricos.
- RPCs: `fn_registrar_obra_social` y `fn_listar_obras_sociales_gestion`, ambas con `fn_exigir_rol(['Gerente'])`.
- `fn_listar_obras_sociales` sigue siendo el catálogo activo que usa Recepción en Pacientes; Particular continúa sin fila.
- SQL: `supabase/migrations/021_hu31_catalogo_obras_sociales.sql`.

### HU-32 — Editar y activar/desactivar obras sociales

- Misma pantalla `/obras-sociales` (HU-31): el Gerente edita el nombre (mismas validaciones del alta) y activa o desactiva. **No se borra la fila.**
- RPCs: `fn_editar_obra_social(p_id_obra_social, p_nombre)` y `fn_cambiar_estado_obra_social(p_id_obra_social, p_activo)` (explícito, no es toggle). Acción `catalogo.gestionar`.
- Una inactiva no sale en `fn_listar_obras_sociales` (combo de pacientes nuevos ni cobertura nueva). Los pacientes que ya la tienen la conservan; al editar se muestra como "(inactiva)" y se reenvía si no se quita. Particular sigue disponible.
- Desactivar no cancela turnos ni cambia coberturas ya guardadas.
- SQL (ya aplicada en el proyecto): `supabase/migrations/022_hu32_obras_sociales_editar_estado.sql`. Pruebas: `tests/obras-sociales.test.mjs`. Evidencia en `docs/hu-32-obras-sociales.md`.

### HU-05 — Disponibilidad

- Pantalla: `/disponibilidad`. Solo **Gerente** y **Mesa de Entradas**.
- RPC: `fn_consultar_disponibilidad(profesional, servicio, fecha, excluir_turno)` (el último es opcional, desde HU-10C: no cuenta a ese turno como ocupado).
- Calcula slots = franjas del día × duración/granularidad del servicio − turnos `confirmado` (antes `otorgado`, cambiado en HU-06). Un turno `cancelado` (HU-10A) no ocupa.
- No horarios pasados; ventana máxima 30 días; solo profesional activo con servicio asociado.
- Tabla mínima `turno` (ocupación). El alta de turnos es HU-06.
- Cada horario libre es un link a `/turnos/nuevo` (HU-06), con el paciente ya elegido (HU-28).
- SQL: `supabase/migrations/004_hu05_disponibilidad.sql`.

### HU-06 — Otorgar turno

- Pantallas: `/turnos/nuevo` y `/turnos/[id]` (resumen). Solo **Gerente** y **Mesa de Entradas**. El orden de los pasos lo define HU-28 (paciente primero).
- RPCs: `fn_otorgar_turno(paciente, profesional, servicio, fecha, hora, obra_social)` y `fn_obtener_turno(id)`.
- Estado del turno: `confirmado` (también `cancelado`, `ausente` y, desde HU-13, `atendido`).
- Concurrencia: al confirmar se revalida el horario (lock por profesional+día + `fn_consultar_disponibilidad`). Restricción `EXCLUDE` (GiST) `turno_sin_superposicion` como última defensa. Error: *El horario seleccionado ya no está disponible*.
- No se otorgan turnos en fecha/hora pasada.
- Cobertura: `turno.id_obra_social` (null = Particular) + `numero_afiliado` guardado al otorgar. Tiene que ser una obra del paciente. Una sola obra → preseleccionada; varias → Recepción elige; siempre se puede elegir Particular.
- SQL: `supabase/migrations/005_hu06_otorgar_turno.sql`. Pruebas: `supabase/tests/hu06_turnos.sql` y `tests/turnos.test.mjs` (`npm test`). Evidencia en `docs/hu-06-otorgar-turno.md`.

### HU-07 — Consultar agenda del profesional

- Pantalla: `/agenda`. Solo **Gerente** y **Mesa de Entradas**.
- RPC: `fn_consultar_agenda_profesional(profesional, fecha)`.
- Muestra los turnos `confirmado`, `cancelado` (desde HU-10A, identificado y con su motivo), `atendido` (HU-13) y `ausente` (HU-10B) del profesional para la fecha, ordenados por horario, con paciente, DNI, servicio, horario, estado y link a `/turnos/[id]`.
- Una fecha sin turnos se muestra vacía, sin error.
- SQL: `supabase/migrations/007_hu07_agenda_profesional.sql`. Pruebas: `tests/agenda.test.mjs` (`npm test`).

### HU-11 — Ver agenda diaria y semanal

- En `/agenda`, Recepción puede alternar entre las vistas Día y Semana para el profesional seleccionado. Profesional, fecha y vista se conservan en la URL.
- La semana va de lunes a domingo; cada día muestra sus turnos ordenados por horario y un mensaje claro si no tiene turnos.
- La consulta reutiliza `fn_consultar_agenda_profesional` para cada fecha; no agrega RPC ni acceso directo a tablas.
- Pruebas de fechas de semana: `tests/agenda.test.mjs` (`npm test`).

### HU-08 — Autenticación y acceso interno

- Matriz: Inicio todos; `/servicios` Gerente + Mesa de Entradas (**solo lectura** para Mesa); `/profesionales/*`, `/usuarios` (HU-29/30) y `/obras-sociales` (HU-31/32) solo Gerente; pacientes, disponibilidad, agenda, turnos (incluye `/turnos` y `/turnos/[id]/reprogramar`) y pagos (`/pagos`, `/turnos/[id]/pago`, HU-14) Gerente + Mesa de Entradas; `/mi-agenda/*` solo Profesional (HU-12/13, `exigirProfesional`).
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

### HU-24A — Orden médica al atender un turno

- En `/mi-agenda/[id]`, dentro del formulario de la atención (registrar y editar): campo **Orden médica (opcional)** aparte de motivo y observaciones, con contador `x / 2000`. En la atención registrada se muestra en su propia sección y solo si tiene contenido. Solo **Profesional** (mismas acciones `atencion.registrar` / `atencion.agenda`).
- Columna `atencion.orden_medica` (null = sin orden, ≤ 2000 con `check`). Reutiliza `registrado_en` / `editado_en` y la relación 1:1 con el turno.
- `fn_registrar_atencion` y `fn_editar_atencion` suman `p_orden_medica text default null` (trim; vacía → `null`; > 2000 → *La orden médica no puede superar los 2000 caracteres*). Se hizo `drop` de las firmas de 3 parámetros: **no dejar dos versiones**.
- `fn_obtener_turno` la devuelve solo dentro de `atencion` (profesional que atendió). Recepción recibe `atencion: null`.
- El historial de órdenes del paciente es HU-24B (Incremento 3): leer `atencion` por `id_paciente`.
- SQL: `supabase/migrations/019_hu24a_orden_medica.sql`. Pruebas: `supabase/tests/hu24a_orden_medica.sql` y `tests/hu24a-orden-medica.test.mjs`. Evidencia en `docs/hu-24a-orden-medica.md`.

### HU-38 — Orden médica con datos automáticos, sesiones y detalle

- Corrige HU-24A: en `/mi-agenda/[id]` la orden muestra de solo lectura paciente (nombre, apellido, DNI), cobertura del turno, profesional con matrícula, servicio y fecha. El profesional carga solo **sesiones** (1..50) y **detalle** (`atencion.orden_medica`, 1..2000). Opcional; si se carga van los dos (*Indicá la cantidad de sesiones* / *Completá el detalle de la orden*). Vaciar los dos al editar = quitar la orden.
- `atencion.orden_sesiones smallint` (check 1..50 y check *sesiones ⇒ detalle*). Órdenes viejas sin sesiones = *No informadas*; se pueden seguir guardando si no se cambia el detalle.
- `fn_registrar_atencion` / `fn_editar_atencion` suman `p_orden_sesiones` (drop + create). `fn_obtener_turno` suma `matricula_profesional` y, dentro de `atencion`, `orden_sesiones`, `orden_cobertura`, `orden_numero_afiliado`.
- Imprimir / PDF: `OrdenMedica` + `ImprimirOrdenButton` (mecanismo HU-27; con varias órdenes en la página se imprime solo la marcada con `.imprimir-esta`).
- SQL: `supabase/migrations/025_hu38_orden_medica_sesiones.sql`. Pruebas: `supabase/tests/hu38_orden_medica_sesiones.sql` y `tests/hu38-orden-medica-sesiones.test.mjs`. Evidencia en `docs/hu-38-orden-medica-sesiones.md`.

### HU-24B — Historial de órdenes médicas del paciente

- **Gerente:** sección **Órdenes médicas** en `/pacientes/[id]` (Mesa de Entradas no la ve). **Profesional:** botón "Historial de órdenes" en `/mi-agenda/[id]` → `/mi-agenda/[id]/ordenes`. Acción `ordenes.consultar` (Gerente + Profesional).
- RPC: `fn_listar_ordenes_paciente(paciente, desde, hasta, profesional)` → `{ paciente, profesionales, total_sin_filtros, ordenes }`. Gerente con `fn_exigir_rol`; Profesional con `fn_exigir_paciente_propio` (*No tenés turnos con este paciente*). Nunca devuelve observaciones ni motivo.
- Filtros por GET (Desde/Hasta de la fecha del turno + Profesional, `src/lib/ordenes/validar.ts`), más reciente primero, reimpresión por orden. Vacío: *Este paciente no tiene órdenes médicas registradas* / *No hay órdenes para esos filtros*.
- SQL: `supabase/migrations/026_hu24b_historial_ordenes.sql`. Pruebas: `supabase/tests/hu24b_historial_ordenes.sql` y `tests/hu24b-historial-ordenes.test.mjs`. Evidencia en `docs/hu-24b-historial-ordenes.md`.

### HU-10B — Marcar ausencia de un turno

- Desde `/turnos/[id]`: botón "Marcar ausente" si `marcable_ausente` (confirmado, sin fila en `atencion` y con la **hora de fin** pasada, hora de Argentina) y "Corregir ausencia" si `ausencia_corregible`. Siempre con confirmación, sin motivo. Solo **Gerente** y **Mesa de Entradas** (acción `turnos.ausente`).
- RPCs: `fn_marcar_ausente(turno)` y `fn_corregir_ausencia(turno)` (únicamente `ausente → confirmado`; no cambia nada más ni habilita atender fuera del día). Mismo lock que otorgar/cancelar.
- Un turno `ausente` sigue ocupando su horario: `turno_sin_superposicion` mira `confirmado`, `atendido` y `ausente`. La agenda muestra los ausentes.
- SQL: `supabase/migrations/014_hu10b_marcar_ausencia.sql`. Pruebas: `supabase/tests/hu10b_marcar_ausencia.sql`. Evidencia en `docs/hu-10b-marcar-ausencia.md`.

### HU-10C — Reprogramar un turno

- Desde `/turnos/[id]` ("Reprogramar" si `reprogramable`: confirmado y no empezó) → `/turnos/[id]/reprogramar?fecha&hora` (calendario, horarios, resumen anterior/nuevo, confirmar). Solo **Gerente** y **Mesa de Entradas** (acción `turnos.reprogramar`).
- RPC: `fn_reprogramar_turno(turno, fecha, hora)`: actualiza **el mismo** turno (solo `fecha`, `hora_inicio`, `hora_fin`). Lock de los dos días (en orden fijo), revalida con `fn_consultar_disponibilidad(..., excluir_turno)` y `EXCLUDE` como última defensa. Rechaza cancelado, atendido, ausente, turno ya empezado, destino pasado y el mismo horario.
- `fn_consultar_disponibilidad` y `fn_consultar_disponibilidad_calendario` suman `p_excluir_turno` (default null): permite mover un turno a un horario que se superpone con el suyo. Se recrearon con `drop` + `create` (no dejar dos versiones).
- SQL: `supabase/migrations/015_hu10c_reprogramar_turno.sql`. Pruebas: `supabase/tests/hu10c_reprogramar_turno.sql` y `tests/hu10c-reprogramar-turno.test.mjs`. Evidencia en `docs/hu-10c-reprogramar-turno.md`.

### HU-09 — Buscar y filtrar turnos

- Pantalla: `/turnos` (menú "Turnos"). Solo **Gerente** y **Mesa de Entradas** (acción `turnos.buscar`). Listado transversal (todos los profesionales); la vista semanal de un profesional es HU-11.
- RPC: `fn_buscar_turnos(texto, profesional, servicio, desde, hasta, estado, pagina, estado_cobro)` → `{ total, pagina, por_pagina, turnos }` (el último parámetro, desde HU-17). Filtros opcionales en AND; texto por palabras (nombre, apellido o comienzo de DNI); 10 por página en orden cronológico.
- Filtros en la URL (`leerFiltrosTurnos` / `urlTurnos` en `src/lib/turnos/busqueda.ts`). Sin `desde`/`hasta` en la URL = hoy; vacíos = sin límite ("Limpiar filtros"). `RangoFechas` (cliente) impide Hasta < Desde.
- SQL: `supabase/migrations/016_hu09_buscar_turnos.sql`. Pruebas: `supabase/tests/hu09_buscar_turnos.sql` y `tests/hu09-buscar-turnos.test.mjs`. Evidencia en `docs/hu-09-buscar-turnos.md`.

### HU-20 — Prioridad o urgencia del turno

- `turno.prioridad` (`normal` por defecto, `alta`, `urgente`) + `prioridad_nota` (≤ 200). Marca visual: no cambia orden, disponibilidad ni sobreturnos.
- Se elige al otorgar (`fn_otorgar_turno(..., p_prioridad)`, drop + create) y se cambia en `/turnos/[id]` con `fn_cambiar_prioridad_turno(turno, prioridad, nota)` si `prioridad_editable` (confirmado y no empezó). Acción `turnos.prioridad` (Gerente + Mesa); el Profesional solo la ve.
- `PrioridadBadge` (texto + color; Normal sin marca) en `/agenda` (día y semana), `/turnos`, `/turnos/[id]`, `/mi-agenda` y `/mi-agenda/[id]`. `/turnos` suma el filtro Prioridad (`fn_buscar_turnos(..., p_prioridad)`, drop + create).
- Reprogramar la conserva; repetir (HU-25) la copia. `fn_obtener_turno`, `fn_consultar_agenda_profesional` y `fn_turno_repetir_confirmar` recreadas.
- SQL: `supabase/migrations/027_hu20_prioridad_turno.sql`. Pruebas: `supabase/tests/hu20_prioridad_turno.sql` y `tests/hu20-prioridad-turno.test.mjs`. Evidencia en `docs/hu-20-prioridad-turno.md`.

### HU-25 — Repetir un turno en las próximas semanas

- Desde `/turnos/[id]` (botón "Repetir semanalmente" si el turno está `confirmado`) y justo después de otorgar (`otorgarTurno` redirige a `/turnos/[id]?nuevo=1`, que abre el formulario). Solo **Gerente** y **Mesa de Entradas** (acción `turnos.repetir`).
- Flujo: semanas (1 a 24) → **Ver fechas** (`fn_turno_repetir_preview`, no escribe) → **Confirmar** (`fn_turno_repetir_confirmar`) → "Se crearon X turnos" + las omitidas con su motivo.
- Mismo día de la semana y hora, mismo paciente, profesional, servicio y cobertura. **No es todo-o-nada**: crea solo las fechas libres y cada una se revalida al confirmar. Motivos: *Horario ocupado*, *Fuera de la franja del profesional*, *Profesional inactivo*, mensaje de HU-05 si el servicio ya no está asociado.
- Serie: tabla `serie_turno` (RLS cerrada) + `turno.id_serie` (el original también). Se crea con el primer turno nuevo; si el turno ya tenía serie, se suma a esa. Cada turno es independiente para cancelar / ausente / reprogramar.
- Regla única: el cuerpo de la disponibilidad está en `fn_horarios_del_dia` (interna, sin rol ni ventana; suma `en_franja`). `fn_consultar_disponibilidad` es el envoltorio con rol + fecha pasada + **30 días** y responde igual que antes. La serie **no** usa la ventana de 30 días (decisión del equipo): el resto de las reglas son las de HU-05/HU-06.
- Lock: el mismo `pg_advisory_xact_lock(profesional + día)` de otorgar, para el día original y todas las fechas nuevas, tomados juntos en orden por hash (como reprogramar). `EXCLUDE` como última defensa: omite la fecha, no aborta la serie.
- SQL: `supabase/migrations/018_hu25_repetir_turno.sql`. Pruebas: `supabase/tests/hu25_repetir_turno.sql` y `tests/hu25-repetir-turno.test.mjs`. Evidencia en `docs/hu-25-repetir-turno.md`.

### Mejoras de UX/UI (menú, otorgar turno, calendario, filtros)

- Menú: Mesa y Profesional siguen con la barra superior. El **Gerente** usa barra superior + menú lateral plegable (estilo ERP): Indicadores; **Atención** (Otorgar turno, Agenda, Turnos, Pagos); **Información** (Profesionales, Pacientes, Obras sociales, Servicios); Personal interno. Al entrar, el Gerente abre `/indicadores`. "Otorgar turno" apunta a `/turnos/nuevo` (paso 1, HU-28).
- `/disponibilidad`: calendario de 30 días (`fn_consultar_disponibilidad_calendario`) + horarios del día; estado en la URL (`?paciente&profesional&servicio&fecha`, helpers en `src/lib/turnos/flujo.ts`). Pasos con `PasosTurno`.
- `/agenda`: profesional y fecha en la URL (sin `useActionState`).
- `/pacientes`: listado con filtros (`fn_filtrar_pacientes`: texto, obra social o particular, rango etario). `fn_buscar_pacientes` sigue para el paso 1 de otorgar.
- Alta de paciente con `?volver=` (solo `/turnos/nuevo`, `urlVolverTurno` + `urlVolverConPaciente`) → vuelve al turno con el paciente elegido.
- Botones de acción: `boton-principal` / `boton-secundario` (+ `boton-peligro`) con `boton-inline` = 44px. Fila de acciones al pie: `acciones-pie`.
- SQL: `supabase/migrations/011_mejoras_pacientes_calendario.sql`. Pruebas: `tests/mejoras-ux.test.mjs`. Detalle en `docs/mejoras-ux.md`.

### HU-14 — Registrar y consultar pagos

- Pantallas: `/turnos/[id]/pago` (registrar, ver y corregir; `?corregir=1`) y `/pagos` (listado). El detalle del turno muestra el bloque "Pago". Solo **Gerente** y **Mesa de Entradas** (acciones `pagos.registrar`, `pagos.consultar`, `pagos.corregir`).
- Tablas `pago` (una por turno, `unique(id_turno)`; `importe_base`, `descuento`, `importe_final = base - descuento > 0`, `medio_pago` en `efectivo|transferencia|debito|credito`, `registrado_en/por`, `corregido_en`) y `pago_correccion` (valores anteriores y nuevos, motivo 1..200, usuario y fecha). RLS y sin grants.
- RPCs: `fn_obtener_pago(turno)` (turno + precio actual del servicio como sugerencia + `cobrable` + pago + historial), `fn_registrar_pago(turno, base, descuento, medio)`, `fn_corregir_pago(turno, base, descuento, medio, motivo)` y `fn_listar_pagos(texto, desde, hasta, pagina)`. Rol con `fn_exigir_rol`. Validación común en `fn_validar_importes_pago` (interna).
- Se cobran turnos `confirmado` o `atendido`. Registrar bloquea el turno (`for update`): un doble envío no duplica (*Este turno ya tiene un pago registrado*). Descuento manual solo si el turno tiene obra social.
- Cancelar, marcar ausente o reprogramar **no** tocan el pago (está en otra tabla, atado al mismo turno): se conserva sin devolución automática. No se modificó ninguna función existente.
- Listado: paciente (como HU-09) y período por **fecha del pago** (hora de Argentina), del más nuevo al más viejo, de a 10.
- Front: importes en centavos (`src/lib/pagos/validar.ts`), coma o punto decimal, sin separador de miles; final en vivo en `PagoForm`.
- SQL: `supabase/migrations/017_hu14_pagos.sql`. Pruebas: `supabase/tests/hu14_pagos.sql` y `tests/hu14-pagos.test.mjs` (`npm test`). Evidencia en `docs/hu-14-pagos.md`.

### HU-22 / HU-17 — Reembolso de un pago (estado Reembolsado)

- En `/turnos/[id]/pago`: botón "Registrar reembolso" si `reembolsable` (lo decide la base) **y** el rol tiene `pagos.reembolsar` (Gerente + Mesa de Entradas). `mostrarBotonReembolso` en `src/lib/pagos/validar.ts`.
- `ReembolsoForm` (cliente): motivo (`turno_cancelado`, `pedido_paciente`, `otro`), detalle ≤ 200 (obligatorio con Otro), medio de devolución (por defecto el del pago) e importe de solo lectura (= `importe_final`, reembolso total). "Revisar reembolso" → resumen + "Esta acción no se deshace" → "Confirmar reembolso" (deshabilitado al enviar). Aviso fijo `AVISO_REEMBOLSO` (billetera virtual fuera del sistema).
- RPC: `fn_registrar_reembolso(p_id_turno, p_motivo, p_detalle, p_medio)` (devuelve lo mismo que `fn_obtener_pago`). `fn_obtener_pago` suma `reembolsable`, `pago.estado` (Pagado/Reembolsado) y `reembolso`. Validación con los mismos mensajes en `validarReembolso`.
- Reembolsado: badge `EstadoPagoBadge`, bloque con fecha/hora AR, motivo, detalle, importe, medio y quién lo registró; se ocultan "Registrar reembolso" y "Corregir pago" (`puedeCorregirPago`; `fn_corregir_pago` igual lo rechaza). El turno no cambia de estado.
- `/pagos`: columna Estado (+ fecha, motivo e importe del reembolso) y filtro Reembolso Todos / Con / Sin (`p_reembolso` de `fn_listar_pagos`, en la URL con `urlPagos`).
- SQL: `supabase/migrations/023_hu22_reembolso_pago.sql` (tabla `reembolso`, `unique(id_pago)`, RLS sin grants). Pruebas: `tests/hu22-reembolso.test.mjs`.

### HU-17 — Estado de cobro de cada turno

- Estados: **Pendiente de pago** (confirmado o atendido sin pago), **Pagado** (tiene pago, aunque después se cancele o se marque ausente), **Reembolsado** (su pago tiene reembolso, HU-22) y **No corresponde cobro** (cancelado o ausente sin pago). Etiquetas y colores en `src/lib/pagos/cobro.ts`; siempre con texto (`EstadoCobroBadge`).
- **No se guarda**: lo calcula la base con una sola regla, `fn_estado_cobro(estado_turno, tiene_pago, tiene_reembolso)` (interna, revocada a `authenticated`). La reutilizan `fn_obtener_turno`, `fn_consultar_agenda_profesional`, `fn_buscar_turnos` y `fn_obtener_pago` (campo `estado_cobro`). Nunca se calcula en el front.
- Pasar a Pagado = registrar el pago (HU-14). No hay botón que cambie el estado. Corregir una ausencia sin pago vuelve a Pendiente (sale de la regla).
- Dónde se ve: detalle del turno (bloque "Pago"), pantalla de pago, `/turnos` (columna **Cobro** + filtro `?cobro=` combinable y que se conserva al paginar; con Pendiente, atajos **Todos / Hasta hoy / Próximos**), agenda Día y Semana. `/pagos` tiene **Ver pendientes de cobro** (`URL_PENDIENTES_COBRO`: Pendiente, sin límite de fechas).
- Solo Recepción y Gerente: en `fn_obtener_turno` y la agenda, al Profesional le llega `estado_cobro: null` (no se ve en `/mi-agenda`).
- El comprobante (HU-35) puede usar `turno.estado_cobro` de `fn_obtener_pago`.
- SQL: `supabase/migrations/024_hu17_estado_cobro.sql` (drop de la firma de 7 parámetros de `fn_buscar_turnos`). Pruebas: `supabase/tests/hu17_estado_cobro.sql` y `tests/hu17-estado-cobro.test.mjs` (`npm test`). Evidencia en `docs/hu-17-estado-cobro.md`.

### HU-35 — Comprobante de pago

- Pantalla `/pagos/[id]/comprobante` (`[id]` = id del pago; `?imprimir=1` abre el diálogo de impresión). Solo **Gerente** y **Mesa de Entradas** (acción `pagos.consultar`). Constancia **interna**, no factura fiscal.
- Contenido (`ComprobantePago`): logo + "KineSys" + "Consultorio de kinesiología", Nº `0000123`, emitido el (= fecha y hora del registro del pago, AR), paciente, turno (fecha, horario, profesional, servicio, estado), cobertura y nº de afiliado o Particular, importes (base, descuento, final en pesos), medio, estado de cobro (HU-17) y quién registró el cobro. Leyendas "Corregido el …" y "Reembolsado el … por $ X".
- PDF: `DescargarComprobanteButton` usa `window.print()` como el PDF de horarios (HU-27); título = `Comprobante 0000123 - Apellido, Nombre`. Al imprimir solo sale `.imprimible`. Sin librerías nuevas.
- Accesos: tras registrar el pago ("Ver comprobante" / "Descargar PDF"), pantalla del pago, detalle del turno con pago y `/pagos` (columna Nº, "Ver comprobante" y búsqueda `?numero=`, combinable). Billetera virtual: muestra el nº de operación (HU-21, migración 029).
- Número: columna `pago.numero_comprobante` (secuencia `pago_numero_comprobante_seq`, unique, not null, revocada al front). Se asigna al registrar (default de la columna) y no cambia al corregir. Los pagos existentes se numeraron en la migración por `registrado_en`. **Puede haber saltos** (un intento rechazado consume un número): decisión del equipo, no es factura fiscal.
- RPCs: `fn_obtener_comprobante(id_pago)` (nueva; *El comprobante no existe*), `fn_obtener_pago` suma `pago.numero_comprobante`, `fn_listar_pagos` suma `numero_comprobante` y `p_numero_comprobante` (drop de la firma de 5 parámetros).
- **Unificación con HU-21** (`029_unificar_pagos_hu21_hu35.sql`): 025 y 028 recreaban cada una su `fn_listar_pagos` y quedaban dos versiones (error *Could not choose the best candidate function*). La 029 deja una sola: `fn_listar_pagos(texto, desde, hasta, pagina, reembolso, medio, numero_comprobante)`; `fn_obtener_pago` con nº de comprobante + nº de operación + estado de cobro; y el comprobante muestra el **nº de operación** si el pago fue con billetera. Al modificar una función de pagos, partir de esta versión.
- SQL: `supabase/migrations/025_hu35_comprobante_pago.sql`. Pruebas: `supabase/tests/hu35_comprobante_pago.sql` y `tests/hu35-comprobante.test.mjs` (`npm test`). Evidencia en `docs/hu-35-comprobante-pago.md`.

### HU-21 — Cobro con billetera virtual

- Sin integración con APIs: Recepción comprueba el cobro en la app de la billetera y lo registra como pago de HU-14 con medio **Billetera virtual** (`billetera`) y **Nº de operación** (4..50 letras/números, sin espacios, único). Con otros medios el campo no aparece y el nº no se guarda.
- `pago.numero_operacion` (check *billetera ⇔ nº*, índice único `idx_pago_numero_operacion`), `pago_correccion.numero_operacion_anterior/_nuevo`, `reembolso.medio_devolucion` admite `billetera`.
- `fn_registrar_pago` / `fn_corregir_pago` (+ `p_numero_operacion`) y `fn_listar_pagos` (+ `p_medio`) con drop + create; helper interno `fn_validar_numero_operacion`. `/pagos` filtra por Medio y muestra el nº.
- SQL: `supabase/migrations/028_hu21_billetera_virtual.sql`. Pruebas: `supabase/tests/hu21_billetera_virtual.sql` y `tests/hu21-billetera-virtual.test.mjs`. Evidencia en `docs/hu-21-billetera-virtual.md`.

### HU-15 — Dashboard del profesional

- En `/` (Inicio), solo para el **Profesional** (acción `atencion.dashboard`); Recepción y Gerente no lo ven (usan `/agenda`). Mes y día elegido en la URL: `/?mes=2026-10&dia=2026-10-05`.
- RPC: `fn_consultar_dashboard_profesional(mes)` (solo lectura, `fn_exigir_rol(['Profesional'])`, profesional = `auth.uid()`, sin parámetro de profesional). Devuelve `dia` (total sin cancelados, atendidos, pendientes = confirmados), `semana` (lunes a domingo de hoy, hora AR: cancelaciones y ausencias) y `mes` (sus turnos de ese mes, todos los estados).
- Calendario mensual de lunes a domingo (sábado y domingo incluidos), hasta 3 turnos por día (hora + estado en texto) y la lista del día con link a `/mi-agenda/[id]`.
- HU-36 (#70) reemplaza el color por proximidad: color según estado (confirmado azul, atendido verde, ausente naranja, cancelado gris) e ícono según proximidad (hoy, 1-3, 4-7 y más de 7 días; sin ícono en turnos no confirmados/pasados). Los colores de `EstadoTurnoBadge` son compartidos por `/agenda`, `/mi-agenda` y `/turnos`; ver `docs/hu-36-calendario-colores-proximidad.md`.
- SQL: `supabase/migrations/017_hu15_dashboard_profesional.sql`. Pruebas: `supabase/tests/hu15_dashboard_profesional.sql` y `tests/hu15-dashboard.test.mjs` (`npm test`). Evidencia en `docs/hu-15-dashboard-profesional.md`.

### HU-39 — Historia clínica del paciente (Profesional)

- Pantalla: `/historia-clinica/[paciente]?turno=` (se abre con el botón "Historia clínica" de `/mi-agenda/[id]`; `?editar=1` muestra el formulario). Solo **Profesional** (`exigirProfesional`, acciones `historia.consultar` y `historia.registrar`). No se entra por `/pacientes` (es de Recepción).
- Tablas `historia_clinica` (una por paciente, `unique(id_paciente)`, seis textos opcionales ≤ 1000, `creado_*` / `modificado_*`) y `historia_clinica_version` (copia de la versión anterior en cada edición), con RLS y sin grants. Nunca se borra.
- RPCs: `fn_obtener_historia_clinica(paciente)` → `{ paciente, ficha | null, versiones, evolucion }` y `fn_guardar_historia_clinica(paciente, 6 textos)` (crea o edita; vacío = sin dato; exige al menos un campo; sin cambios no crea versión; lock por paciente).
- Acceso: helper interno `fn_exigir_paciente_propio(uuid)` (revocado a `authenticated`): Profesional activo con al menos un turno (cualquier estado) con el paciente; si no, *No tenés turnos con este paciente*. Mesa de Entradas y Gerente quedan afuera (lo clínico es de los profesionales).
- Evolución = atenciones de HU-13 del paciente con **todos** los profesionales (motivo, observaciones, orden médica de HU-24A), solo lectura. HU-16 va a sumar ahí el resto del historial.
- PDF (Should): `ImprimirHistoriaButton` con el mecanismo de HU-27 (`.solo-impresion`); `.historia-impresion` imprime en varias páginas.
- SQL: `supabase/migrations/024_hu39_historia_clinica.sql`. Pruebas: `supabase/tests/hu39_historia_clinica.sql` y `tests/hu39-historia-clinica.test.mjs` (`npm test`). Evidencia en `docs/hu-39-historia-clinica.md`.

### HU-26 — Indicadores generales del centro (vista corta, Incremento 2)

- Pantalla: `/indicadores?desde&hasta` (por defecto el mes actual; atajos últimos 7 días / este mes / mes anterior). Solo **Gerente** (`exigirGerente`, acción `indicadores.consultar`).
- RPC: `fn_consultar_indicadores_generales(desde, hasta)` (solo lectura, `fn_exigir_rol(['Gerente'])`, período ≤ 366 días).
- Turnos cuyo día cae en el período: total y por estado. Pacientes nuevos = `paciente.creado` (hora AR) en el período. Sin datos → todo en 0.
- **No** incluye ocupación, desglose por profesional/servicio ni pacientes recurrentes: eso es HU-18 (#18, Incremento 3).
- SQL: `supabase/migrations/013_hu26_indicadores_generales.sql`. Pruebas: `supabase/tests/hu26_indicadores.sql` y `tests/hu26-indicadores.test.mjs` (`npm test`). Detalle en `docs/hu-26-indicadores.md`.

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
