# HU-10B — Marcar ausencia de un turno

Rama: `feature/turnos-ausencia-reprogramar-listado`. Issue: #10. Depende de HU-06 (otorgar), HU-10A (cancelar) y HU-13 (atención).

> Como Recepción quiero marcar la ausencia de un turno y corregirla si fue un error, para que el turno refleje que el paciente no asistió, sin borrar el registro.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Solo Recepción y Gerente marcan Ausente un turno Confirmado, sin atención y con la hora de fin ya pasada (hora de Argentina) | ✅ |
| 2 | Antes del inicio y durante el turno no se permite | ✅ |
| 3 | No se marca sobre Cancelado, Atendido o ya Ausente. Siempre con acción explícita (botón + confirmación), nunca automático | ✅ |
| 4 | "Corregir ausencia" (con confirmación) devuelve Ausente → Confirmado conservando el resto del turno | ✅ |
| 5 | Corregir no permite otro estado, reprogramar ni registrar atención fuera del día (HU-13 sigue exigiendo el día del turno) | ✅ |
| 6 | El detalle (`/turnos/[id]`), el listado (HU-09) y la agenda (HU-07/HU-12) muestran el estado guardado | ✅ |
| 7 | Un turno Ausente sigue ocupando su horario | ✅ |
| 8 | Sin rol Recepción/Gerente no se puede. Acción `turnos.ausente` + validación en la `fn_*` | ✅ |

## Flujo

1. `/turnos/[id]`: si la base devuelve `marcable_ausente` aparece **Marcar ausente**; si devuelve `ausencia_corregible`, **Corregir ausencia**.
2. El botón despliega una confirmación (`AusenciaTurnoForm`, sin motivo).
3. `marcarAusente` / `corregirAusencia` (server actions) → `exigirAccion("turnos.ausente")` → `fn_marcar_ausente` / `fn_corregir_ausencia` → `revalidatePath` de `/turnos/[id]`, `/turnos` y `/agenda`.
4. Si la RPC falla se muestra su `error.message` tal cual.

## Backend — `supabase/migrations/014_hu10b_marcar_ausencia.sql`

- `fn_marcar_ausente(p_id_turno)`: `fn_es_recepcion()`, mismo `pg_advisory_xact_lock` (profesional + día) que otorgar/cancelar y `select ... for update`. Rechaza: ya ausente, cancelado, atendido o con fila en `atencion`, y `fecha + hora_fin > ahora` (*Solo se puede marcar la ausencia cuando terminó el horario del turno*).
- `fn_corregir_ausencia(p_id_turno)`: únicamente `ausente → confirmado` (*Solo se puede corregir la ausencia de un turno marcado como ausente*). No toca fecha, hora, paciente, cobertura ni nada más.
- `turno_sin_superposicion` ahora cuenta `confirmado`, `atendido` **y `ausente`**.
- `fn_obtener_turno` suma `marcable_ausente` y `ausencia_corregible`.
- `fn_consultar_agenda_profesional` devuelve también los `ausente`.
- `fn_consultar_disponibilidad` no necesitó cambios para esta HU: un turno se marca ausente recién cuando terminó y la disponibilidad nunca ofrece horarios pasados. (HU-10C igual la suma a los estados ocupados, por coherencia.)
- No se agregan columnas: el estado alcanza y la HU no pide motivo.

## Front

- `src/lib/auth/permisos.ts`: acción `turnos.ausente` (Gerente + Mesa de Entradas).
- `src/lib/turnos/actions.ts`: `marcarAusente`, `corregirAusencia`.
- `src/components/turnos/AusenciaTurnoForm.tsx` (`"use client"` por abierto/cerrado y `useActionState`).
- `src/components/turnos/EstadoTurnoBadge.tsx` + `globals.css`: `.badge-ausente` (ámbar, distinto de cancelado).

## Pruebas

| Criterio | Prueba |
|---|---|
| 1 | SQL: turno pasado sin atención → `marcable_ausente` y queda `ausente` |
| 2 | SQL: turno futuro y turno en curso → rechazo |
| 3 | SQL: ausente dos veces, cancelado, atendido y confirmado con atención → rechazo |
| 4/5 | SQL: corregir → `confirmado`, misma fecha/hora/paciente, `atendible = false` |
| 6 | SQL: la agenda devuelve el `ausente` |
| 7 | SQL: insertar un confirmado encima del ausente → `exclusion_violation` |
| 8 | SQL: Profesional → *No tenés permiso para marcar/corregir ausencias*. Unit: matriz HU-08 con `turnos.ausente` |

- **Unitarias:** `npm test`.
- **SQL:** pegar `supabase/tests/hu10b_marcar_ausencia.sql` en el SQL editor (con la 014 aplicada). Crea su paciente (DNI 99020201) y turnos, y hace `rollback`.

## Evidencia (29/09/2026)

- **Migración:** 014 aplicada en Supabase (`014_hu10b_marcar_ausencia`).
- **SQL:** `hu10b_marcar_ausencia.sql` pasó completo, incluido el caso "turno en curso".
- **Unitarias:** `npm test` → 93/93. **Tipos:** `tsc --noEmit` sin errores. `grep "\.from(" src/` → 0.
