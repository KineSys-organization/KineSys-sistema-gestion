# HU-10C — Reprogramar un turno

Rama: `feature/turnos-ausencia-reprogramar-listado`. Issue: #50. Depende de HU-05 (disponibilidad), HU-06 (otorgar) y HU-10B (estados).

> Como Recepción quiero reprogramar un turno confirmado a otro horario disponible, para conservar el mismo turno (paciente, profesional, servicio, cobertura y pago) sin crear uno nuevo.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Turno Confirmado que no empezó → Recepción/Gerente eligen nueva fecha y hora con la disponibilidad de HU-05 (calendario + horarios) | ✅ |
| 2 | El flujo parte del turno (`/turnos/[id]` → **Reprogramar**), no de un hueco vacío | ✅ |
| 3 | Resumen con paciente, profesional, servicio, horario anterior y nuevo antes de confirmar. Salir sin confirmar conserva el turno | ✅ |
| 4 | Al confirmar se revalida (lock, horarios libres, no pasado). Se actualiza **el mismo** turno, se libera el horario anterior y sigue Confirmado | ✅ |
| 5 | Solo cambian fecha y hora: se conservan id, paciente, profesional, servicio y cobertura (y en el futuro, pago y serie) | ✅ |
| 6 | Si el horario se ocupó → *El horario seleccionado ya no está disponible* y el turno original no cambia | ✅ |
| 7 | No se reprograma Cancelado, Atendido, Ausente ni uno cuya hora de inicio ya llegó | ✅ |
| 8 | Un turno en curso no se reprograma | ✅ |
| 9 | Manda la franja del profesional (HU-02B): sábado/domingo si hay franja; sin franja no hay hueco | ✅ |
| 10 | Sin rol Recepción/Gerente no se puede. Acción `turnos.reprogramar` + `fn_*` | ✅ |

## Flujo

1. `/turnos/[id]`: si la base devuelve `reprogramable` aparece **Reprogramar**.
2. `/turnos/[id]/reprogramar`: datos del turno + calendario de 30 días (`fn_consultar_disponibilidad_calendario` sin contar al propio turno) + horarios del día. El horario actual se ve marcado como "actual" y no se puede elegir.
3. Elegir un horario → `?fecha=&hora=` → resumen (horario anterior tachado y el nuevo). Si en ese momento ya no está libre se avisa antes de confirmar.
4. **Confirmar nuevo horario** → `reprogramarTurno` → `exigirAccion("turnos.reprogramar")` → `fn_reprogramar_turno` → redirige a `/turnos/[id]?reprogramado=1` con el aviso. **Elegir otro horario** vuelve al calendario; **Volver sin cambios**, al turno.

## Backend — `supabase/migrations/015_hu10c_reprogramar_turno.sql`

- `fn_reprogramar_turno(p_id_turno, p_fecha, p_hora)`:
  1. `fn_es_recepcion()`; campos obligatorios.
  2. Lock `pg_advisory_xact_lock` de **los dos días** (el que se libera y el que se ocupa), siempre en el mismo orden para que dos reprogramaciones cruzadas no se traben. `select ... for update` del turno; si otra reprogramación lo movió mientras esperaba, pide reintentar.
  3. Rechaza cancelado / atendido / ausente, turno que ya empezó, destino en el pasado y el mismo horario.
  4. Revalida con `fn_consultar_disponibilidad(..., p_excluir_turno => el turno)`: franjas, granularidad, ventana de 30 días, profesional activo con el servicio.
  5. `update` de `fecha`, `hora_inicio` y `hora_fin` (duración actual del servicio). `exclusion_violation` → mismo mensaje de horario no disponible.
- `fn_consultar_disponibilidad` y `fn_consultar_disponibilidad_calendario` suman `p_excluir_turno uuid default null`. Sin él funcionan igual que antes (lo usan `/disponibilidad` y `fn_otorgar_turno`). Hace falta para poder correr un turno a un horario que se superpone con el suyo (ej.: 15 minutos más tarde con granularidad de 15). Se hace `drop` + `create` porque agregar un parámetro con `create or replace` dejaría dos versiones y las llamadas de 3 argumentos serían ambiguas.
- La disponibilidad cuenta como ocupados `confirmado`, `atendido` y `ausente` (igual que `turno_sin_superposicion` desde la 014).
- `fn_obtener_turno` suma `reprogramable` (mismo criterio que `cancelable`).

## Front

- `src/lib/turnos/validar.ts`: `validarReprogramacion`, `urlReprogramar`.
- `src/lib/turnos/actions.ts`: `reprogramarTurno`.
- `src/lib/disponibilidad/actions.ts`: `obtenerCalendario` / `obtenerDisponibilidad` aceptan `excluir_turno` (opcional).
- `src/app/(main)/turnos/[id]/reprogramar/page.tsx` (ruta cubierta por `/turnos` en la matriz HU-08, `exigirRecepcion`).
- `src/components/disponibilidad/CalendarioDias.tsx`: el calendario como componente (no se tocó `/disponibilidad` para no pisar la rama de HU-28).
- `src/components/turnos/ConfirmarReprogramacionForm.tsx` (`"use client"` por `useActionState`).

## Pruebas

| Criterio | Prueba |
|---|---|
| 1/4/5 | SQL: reprograma al último horario libre → mismo `id_turno`, paciente, profesional, servicio y cobertura; no hay turno nuevo; el horario anterior vuelve a estar libre y el nuevo no |
| 6 | SQL: destino ocupado por otro turno → rechazo y `fn_obtener_turno` idéntico al de antes |
| 7/8 | SQL: cancelado, ausente, atendido y confirmado ya empezado → rechazo con su mensaje; `reprogramable = false` |
| 9 | SQL: día sin franja → *ya no está disponible*; más de 30 días → mensaje de HU-05 |
| Superpuesto | SQL: con un servicio de granularidad menor a la duración, mover el turno a un horario que pisa el suyo funciona |
| 10 | SQL: Profesional → *No tenés permiso para reprogramar turnos*. Unit: matriz HU-08 con `turnos.reprogramar` y la ruta `/turnos/x/reprogramar` |
| Front | Unit: `tests/hu10c-reprogramar-turno.test.mjs` (`validarReprogramacion`, `urlReprogramar`) |

- **SQL:** `supabase/tests/hu10c_reprogramar_turno.sql` (con la 014 y la 015 aplicadas; pacientes DNI 99030301/99030302; `rollback`).

## Evidencia (29/09/2026)

- **Migración:** 015 aplicada en Supabase (`015_hu10c_reprogramar_turno`).
- **SQL:** `hu10c_reprogramar_turno.sql` pasó completo. El caso superpuesto se verificó moviendo un turno de 45 min de las 21:15 a las 20:45.
- **Unitarias:** `npm test` → 93/93. **Tipos:** `tsc --noEmit` sin errores.
