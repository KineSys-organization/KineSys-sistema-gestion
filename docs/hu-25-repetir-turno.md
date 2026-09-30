# HU-25 — Repetir un turno en las próximas semanas

Rama: `feature/hu-25-repetir-turno`. Issue: #28. Depende de HU-05 (disponibilidad), HU-06 (otorgar), HU-02B (franjas), HU-10A/B/C (cancelar, ausente, reprogramar) y HU-28 (flujo desde el paciente).

> Como Recepción quiero repetir un turno ya otorgado a un paciente durante las próximas semanas (mismo profesional, servicio, día y hora), para agendar el tratamiento completo sin cargar cada sesión a mano.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | La serie nace de un turno **Confirmado** con paciente. Nunca desde un hueco vacío ni sin paciente | ✅ |
| 2 | Puntos de entrada: detalle `/turnos/[id]` y justo después de confirmar un turno nuevo. En los dos se indican las semanas | ✅ |
| 3 | Preview obligatorio: cada fecha con su estado (disponible / no disponible + motivo) antes de crear nada | ✅ |
| 4 | Al confirmar se crean turnos **independientes** (mismo paciente, profesional, servicio, cobertura y hora), revalidados en ese momento | ✅ |
| 5 | No es todo-o-nada: se crean las disponibles y se informa cuáles no y por qué | ✅ |
| 6 | Cancelar / ausente / reprogramar afecta solo a ese turno | ✅ |
| 7 | Máximo 24 repeticiones además del original; semanal (mismo día y hora); varios días por semana = una serie por turno | ✅ |
| 8 | Sábado o domingo solo si el profesional tiene franja ese día (sin veto hardcodeado) | ✅ |
| 9 | Los turnos quedan vinculados como serie (`serie_turno` + `turno.id_serie`) | ✅ |

## Decisión: ventana de 30 días

`fn_consultar_disponibilidad` limita a 30 días desde hoy, y `fn_otorgar_turno` la reusa. Con esa regla, a partir de la 5ª semana ninguna fecha de la serie estaría disponible. El equipo decidió que la ventana es de la **pantalla de búsqueda** (disponibilidad, calendario, otorgar a mano y reprogramar siguen igual) y que la serie aplica **todas las demás** reglas de HU-05/HU-06.

## Flujo

1. `/turnos/[id]` de un turno confirmado → **Repetir semanalmente** (o se abre solo al llegar desde otorgar: `?nuevo=1`).
2. Semanas (1 a 24, por defecto 4) → **Ver fechas** → `previsualizarRepeticion` → `fn_turno_repetir_preview`. Tabla con fecha, día, hora, estado y motivo.
3. **Confirmar N turnos** (deshabilitado si no hay disponibles o mientras procesa) → `confirmarRepeticion` → `fn_turno_repetir_confirmar`. Confirma las semanas del preview que se está viendo.
4. Resultado: "Se crearon X turnos" (con link a cada uno) y la lista de las fechas que no se crearon con su motivo.

## Backend — `supabase/migrations/018_hu25_repetir_turno.sql`

- **Modelo**: `serie_turno (id_serie, id_turno_origen, id_paciente, id_profesional, id_servicio, creada_por, creada_en)` con RLS y `revoke` (se accede solo por `fn_*`). `turno.id_serie` nullable; el turno original también queda en la serie. La serie se crea con el primer turno nuevo (si no se crea ninguno, no hay serie); si el turno ya tenía serie, se suma a esa.
- **Regla única de disponibilidad**: el cuerpo de `fn_consultar_disponibilidad` pasa a `fn_horarios_del_dia` (interna, revocada a `authenticated`): profesional activo, servicio asociado, franjas, granularidad y ocupación. Suma `en_franja` (todos los horarios de la franja) para distinguir ocupado de fuera de franja. `fn_consultar_disponibilidad` queda como envoltorio (rol, fecha pasada, 30 días) y devuelve **exactamente** lo mismo (sin `en_franja`).
- `fn_evaluar_repeticion` (interna): ¿se puede dar esa hora ese día? → `{ disponible, motivo, hora_fin }`. La usan el preview y el confirmar.
- `fn_turno_repetible` (interna): rol (`fn_es_recepcion`), semanas 1–24, turno existente, `confirmado`, con paciente activo.
- `fn_turno_repetir_preview(p_id_turno, p_semanas)` → filas `fecha, hora_inicio, hora_fin, disponible, motivo`. No escribe.
- `fn_turno_repetir_confirmar(p_id_turno, p_semanas)` → `{ id_serie, creados: [{id_turno, fecha}], omitidos: [{fecha, motivo}] }`:
  1. Mismo `pg_advisory_xact_lock(profesional + día)` que otorgar, para el día original y cada fecha nueva, todos juntos y ordenados por el hash (como reprogramar), así no se traba con otra serie ni con una reprogramación.
  2. Relee el turno con `for update`: si lo cancelaron o movieron mientras esperaba, pide reintentar.
  3. Por fecha: revalida con `fn_evaluar_repeticion`; si está libre inserta (duración actual del servicio, cobertura y nº de afiliado del original). El `insert` va en su propio bloque: un `exclusion_violation` omite esa fecha y sigue con el resto.

## Front

- `src/lib/auth/permisos.ts`: acción `turnos.repetir` (Gerente + Mesa de Entradas).
- `src/lib/turnos/validar.ts`: `validarRepetir`, `MAXIMO_SEMANAS_REPETIR`.
- `src/lib/turnos/actions.ts`: `previsualizarRepeticion`, `confirmarRepeticion` (`exigirAccion` + validación + `rpc`); `otorgarTurno` redirige con `?nuevo=1`.
- `src/components/turnos/RepetirTurnoForm.tsx` (`"use client"` por `useActionState`).
- `src/app/(main)/turnos/[id]/page.tsx`: aviso "Turno otorgado…" con `?nuevo=1` y el botón.

## Pruebas

`supabase/tests/hu25_repetir_turno.sql` (todo se revierte) y `tests/hu25-repetir-turno.test.mjs` (`npm test`).

| Caso | Prueba | Resultado |
|---|---|---|
| Serie de 4 semanas sin conflictos | SQL: preview 4/4 disponibles; confirmar → 4 creados, 0 omitidos; 5 turnos (original + 4) con el mismo `id_serie`, mismo paciente/profesional/servicio/hora/día; `serie_turno` guarda origen y quién la creó | ✅ |
| Una semana ocupada | SQL: preview marca la 2ª semana *Horario ocupado*; confirmar → 3 creados y esa fecha en `omitidos` con su motivo | ✅ |
| Sábado sin / con franja | SQL: turno un sábado con franja → disponible; se borra la franja del sábado → *Fuera de la franja del profesional* y no se crea nada (ni la serie) | ✅ |
| Profesional inactivo | SQL: `profesional.activo = false` → *Profesional inactivo* | ✅ |
| 0 o 25 semanas | SQL: preview y confirmar → *Podés repetir el turno entre 1 y 24 semanas*; 24 → 24 filas. Unit: `validarRepetir` rechaza 0, 25, vacío, decimales y negativos | ✅ |
| Turno no confirmado / sin paciente / inexistente | SQL: cancelado → *Solo se puede repetir un turno confirmado*; `id_paciente` null → *El turno no tiene un paciente asociado*; uuid al azar → *El turno no existe* | ✅ |
| Rol Profesional | SQL: preview y confirmar → *No tenés permiso para repetir turnos*. Unit: matriz HU-08 con `turnos.repetir` | ✅ |
| Independencia | SQL: cancelar un turno de la serie (HU-10A), marcar ausente una sesión pasada (HU-10B) y reprogramar uno (HU-10C, serie dentro de los 30 días) → los demás turnos de la serie quedan idénticos | ✅ |
| Condición de carrera | SQL: preview con 2 libres; otro turno toma la 1ª semana; confirmar → 1 creado, la tomada en `omitidos` (*Horario ocupado*), sin error general | ✅ |
| Disponibilidad de siempre | SQL: `fn_consultar_disponibilidad` no devuelve `en_franja` y sigue cortando a 31 días; `authenticated` no puede llamar a `fn_horarios_del_dia`. Además se corrió de nuevo `supabase/tests/hu10c_reprogramar_turno.sql` (otorgar, calendario y reprogramar) y pasa | ✅ |
| Sin `.from(` | `grep -rn "\.from(" src/` → sin resultados | ✅ |
| Build y tests | `npm run build` y `npm test` (116 pruebas) pasan. El repo no tiene script de lint | ✅ |

La migración 018 se aplicó en el proyecto `dbfehkykxsqgpctskuuq` el 30/09/2026.
