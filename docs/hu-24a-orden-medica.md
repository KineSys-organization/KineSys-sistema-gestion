# HU-24A — Registrar la orden médica al atender un turno

Rama: `feature/hu-24a-orden-medica`. Issue: #44. Extiende HU-13 (`atencion`) y depende de HU-08 (acceso) y HU-12 (turno propio). El historial de órdenes del paciente es HU-24B (Incremento 3) y queda fuera.

> **HU-24A.** Como Profesional quiero registrar la orden médica al atender un turno, para dejar constancia de la prescripción, aparte de las notas clínicas que ya existen.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | En `/mi-agenda/[id]`, al registrar o editar la atención, hay un campo **Orden médica** separado de motivo y observaciones | ✅ |
| 2 | Motivo (opcional ≤ 200) y observaciones (1..2000) sin cambios; orden opcional ≤ 2000 | ✅ |
| 3 | La orden queda atada al turno (y por él al paciente y al profesional) con fecha y hora de registro; al editarla se actualiza `editado_en` | ✅ |
| 4 | Se puede marcar Atendido sin orden médica | ✅ |
| 5 | Solo el profesional dueño del turno la carga, edita o ve; Recepción no | ✅ |
| 6 | Sin `supabase.from`; se extienden `fn_registrar_atencion`, `fn_editar_atencion` y el JSON de `fn_obtener_turno` | ✅ |

## Diseño

- **Dónde vive:** columna `atencion.orden_medica` (null = sin orden). `atencion` ya es 1:1 con el turno (`unique(id_turno)`) y guarda `id_profesional`, `id_paciente`, `registrado_en` y `editado_en`, así que no hace falta otra tabla ni columnas de fecha. HU-24B puede leer las órdenes por `id_paciente` (índice `idx_atencion_paciente` ya existente).
- **Normalización:** `trim`; si queda vacía se guarda `null` (en la función, no solo en el front). Al editar, vaciarla la quita.
- **Largo:** ≤ 2000 en tres lugares: `validarAtencion` (front), la función (`La orden médica no puede superar los 2000 caracteres`) y el `check atencion_orden_medica_largo` (última defensa).
- **Quién la ve:** `fn_obtener_turno` la suma **dentro** del objeto `atencion`, que solo se arma cuando `a.id_profesional = auth.uid()`. A Gerente y Mesa de Entradas les llega `atencion: null` (sin la clave `orden_medica` en ningún lado del JSON).

## Backend — `supabase/migrations/019_hu24a_orden_medica.sql`

- `alter table atencion add column orden_medica text` + `check (orden_medica is null or char_length(orden_medica) <= 2000)`.
- `drop function fn_registrar_atencion(uuid, text, text)` y `fn_editar_atencion(uuid, text, text)`, y se recrean con `p_orden_medica text default null`. Sin el drop quedarían dos versiones y `rpc` sería ambiguo. Llamarlas con 3 argumentos sigue funcionando por el default.
- Mismas validaciones de HU-13: `fn_exigir_turno_propio` (Profesional activo y dueño), observaciones, motivo, turno confirmado y del día.
- `fn_obtener_turno`: copia de la 015 con un único dato nuevo (`'orden_medica'` dentro de `atencion`).
- `revoke` / `grant` de siempre con las firmas nuevas (`authenticated` sí, `anon` no).

## Front

- `src/lib/atencion/validar.ts`: `LARGO_MAXIMO_ORDEN_MEDICA = 2000`; `CamposAtencion.orden` opcional; `validarAtencion` controla el largo.
- `src/lib/atencion/actions.ts`: `registrarAtencion` / `editarAtencion` leen `orden_medica` y mandan `p_orden_medica` (vacía = `null`).
- `src/components/atencion/AtencionForm.tsx`: textarea **Orden médica (opcional)** debajo de observaciones, con contador `x / 2000`; en edición viene precargada y "Cancelar edición" la restaura.
- `src/app/(main)/mi-agenda/[id]/page.tsx`: en "Atención registrada", bloque **Orden médica** aparte y solo si tiene contenido.
- `src/app/globals.css`: `.contador-caracteres` y `.bloque-orden-medica` con las variables de la paleta.

## Pruebas

- **Unitarias:** `npm test` → `tests/hu24a-orden-medica.test.mjs` (opcional, 2000 sí / 2001 no, solo espacios, reglas de HU-13 intactas, actions y migración).
- **SQL:** `supabase/tests/hu24a_orden_medica.sql` en el SQL editor (con la 019 aplicada). Termina con `rollback`.

| Caso | Dónde | Resultado |
|---|---|---|
| Registrar con orden → se guarda y se ve al volver a abrir el turno | SQL | ✅ |
| Registrar sin orden → Atendido y `orden_medica = null` | SQL | ✅ |
| Orden con solo espacios → `null` (al registrar y al editar) | SQL + unit | ✅ |
| Orden de 2001 → rechazada en front, función (registrar y editar) y `check` | SQL + unit | ✅ |
| Editar la orden → cambia el valor y `editado_en` deja de ser null | SQL | ✅ |
| Otro profesional registra / edita / ve → *El turno no existe o no pertenece a tu agenda* | SQL | ✅ |
| Mesa de Entradas y Gerente abren el turno → `atencion: null`, sin `orden_medica` en el JSON; no pueden registrar ni editar | SQL | ✅ |
| Motivo y observaciones con las reglas de HU-13 | SQL + unit + `hu12_hu13_atencion.sql` | ✅ |
| Una sola firma de `fn_registrar_atencion` / `fn_editar_atencion` en `pg_proc` | SQL | ✅ |
| `grep -rn "\.from(" src/` sin resultados | shell | ✅ |
| `npm run build` y `npx tsc --noEmit` | shell | ✅ (el repo no tiene script ni config de lint) |

## Evidencia (30/09/2026)

**Migración** — `019_hu24a_orden_medica.sql` aplicada en Supabase (`dbfehkykxsqgpctskuuq`) el 30/09/2026 como `019_hu24a_orden_medica`. Antes se verificó que el `fn_obtener_turno` real coincidía por hash (md5 del cuerpo) con el de la 015. Después, en `pg_proc`: una sola firma de cada una, `fn_registrar_atencion(uuid, text, text, text)` y `fn_editar_atencion(uuid, text, text, text)`, `security definer`, `execute` para `authenticated` y no para `anon`.

**SQL** — `hu24a_orden_medica.sql`: OK, rollback sin residuos (0 pacientes de prueba, el Gerente sigue con rol Gerente, 0 órdenes cargadas). Regresión `hu12_hu13_atencion.sql` sobre la base migrada: OK.

**Unitarias** — `npm test`: 116/116.
