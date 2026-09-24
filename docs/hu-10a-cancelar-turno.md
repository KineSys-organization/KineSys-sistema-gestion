# HU-10A — Cancelar un turno

Rama: `feature/hu-10a-cancelar-turno`. Issue: #26. Depende de HU-05 (disponibilidad) y HU-06 (otorgar turno). Modifica la agenda de HU-07.

> Como Recepción quiero cancelar un turno otorgado indicando el motivo, para liberar el horario y que la agenda refleje solo las atenciones que realmente se van a dar.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Turno confirmado y futuro, cancelado con motivo → queda "cancelado" y el horario vuelve a figurar libre en `/disponibilidad` | ✅ |
| 2 | En la agenda del profesional el turno cancelado aparece como "Cancelado" y no bloquea el horario | ✅ |
| 3 | Cancelar un turno ya cancelado → se impide | ✅ |
| 4 | Turno cuya fecha y hora ya pasó → *El turno ya pasó; corresponde marcarlo como Ausente* | ✅ |
| 5 | Confirmar la cancelación sin motivo → se rechaza | ✅ |

## Flujo

1. `/agenda` o el resumen de HU-06: cada turno linkea a `/turnos/[id]`.
2. `/turnos/[id]`: si el turno está confirmado y no pasó (`cancelable`, lo calcula la base), aparece **Cancelar turno**.
3. Se despliega el formulario: motivo (*A pedido del paciente*, *Por el profesional*, *Otro*), detalle opcional (máx. 200) y **Confirmar cancelación**.
4. `cancelarTurno` (server action) → `exigirAccion("turnos.cancelar")` → `validarCancelacion` → `fn_cancelar_turno` → `revalidatePath` de `/turnos/[id]`, `/agenda` y `/disponibilidad`.
5. El resumen pasa a **Cancelado** con motivo, detalle y fecha de cancelación, sin el botón. Si la RPC falla se muestra su `error.message` tal cual.

## Backend — `supabase/migrations/009_hu10a_cancelar_turno.sql`

- Tabla `turno` (columnas nuevas): `motivo_cancelacion` (`pedido_paciente | profesional | otro`), `detalle_cancelacion` (≤ 200), `cancelado_en`, `cancelado_por → usuario`. Check `turno_cancelado_con_motivo`: un turno cancelado siempre tiene motivo. El turno **no se borra** (lo usan HU-16 y HU-18).
- `fn_cancelar_turno(p_id_turno, p_motivo, p_detalle)`:
  1. `fn_es_recepcion()` (Gerente o Mesa de Entradas activos).
  2. Turno y motivo obligatorios, motivo de la lista, detalle ≤ 200 (vacío → `null`).
  3. Mismo `pg_advisory_xact_lock` que `fn_otorgar_turno` (profesional + día) y `select ... for update` del turno.
  4. No existe / ya cancelado / ya ausente → error.
  5. `fecha + hora_inicio <= ahora` (hora de Argentina, mismo criterio que HU-06) → *El turno ya pasó; corresponde marcarlo como Ausente*.
  6. `update` a `cancelado` con motivo, detalle, `cancelado_en = now()`, `cancelado_por = auth.uid()`; devuelve `fn_obtener_turno`.
- `fn_obtener_turno`: suma `motivo_cancelacion`, `detalle_cancelacion`, `cancelado_en` y `cancelable`.
- `fn_consultar_agenda_profesional`: devuelve `confirmado` **y** `cancelado` ordenados por hora (en el mismo horario, el confirmado primero) con `motivo_cancelacion`. Permisos y validaciones sin cambios.
- Sin cambios en `fn_consultar_disponibilidad` ni en `turno_sin_superposicion`: los dos solo miran `confirmado`, así que el horario cancelado queda libre solo.

## Front

- `src/lib/turnos/validar.ts`: `MOTIVOS_CANCELACION`, `validarCancelacion`, `etiquetaMotivo`.
- `src/lib/turnos/actions.ts`: `cancelarTurno`.
- `src/lib/auth/permisos.ts`: acción `turnos.cancelar` (Gerente + Mesa de Entradas).
- `src/components/turnos/CancelarTurnoForm.tsx` (`"use client"` por el estado abierto/cerrado).
- `/turnos/[id]`: botón, formulario y datos de la cancelación. `/agenda`: columna Estado, filas canceladas atenuadas y tachadas, link "Ver turno".
- `globals.css`: `.badge-cancelado`, `.fila-cancelada`, `.campo textarea`.

## Pruebas

| Criterio | Prueba |
|---|---|
| 1 | SQL: cancelar con motivo → `cancelado`, el horario vuelve a `fn_consultar_disponibilidad` |
| 2 | SQL: la agenda lo devuelve `cancelado` y se otorga otro turno en el mismo horario |
| 3 | SQL: segunda cancelación → *El turno ya está cancelado* |
| 4 | SQL: turno pasado insertado directo → mensaje de Ausente y `cancelable = false` |
| 5 | SQL (motivo `null` y vacío) + unit (`validarCancelacion`) |
| Permisos | SQL: un Profesional → *No tenés permiso para cancelar turnos*. Unit: matriz HU-08 con `turnos.cancelar` |

### Cómo correrlas

- **Unitarias:** `npm test` (`tests/hu10a-cancelar-turno.test.mjs` + el resto).
- **SQL:** pegar `supabase/tests/hu10a_cancelar_turno.sql` en el SQL editor de Supabase (con la 009 aplicada). Simula Mesa de Entradas (carlaperez@) y Profesional con `set local role authenticated` + `request.jwt.claims`, crea sus pacientes (DNI 99010101/99010102) y hace `rollback`. Si todo pasa muestra `HU-10A: todas las pruebas pasaron`.

## Evidencia (24/09/2026)

**Unitarias** — `npm test`:

```
ℹ tests 41
ℹ pass 41
ℹ fail 0
```

**Build** — `npm run build` OK. **Arquitectura** — `grep -rn "\.from(" src/` → 0 resultados.

**Migración** — `009_hu10a_cancelar_turno.sql` aplicada en Supabase el 24/09/2026 (registrada como `hu10a_cancelar_turno`). Verificado: las 4 columnas nuevas, los checks `turno_motivo_cancelacion_valido`, `turno_detalle_cancelacion_largo` y `turno_cancelado_con_motivo`, las 3 funciones `security definer` con `search_path = ''`, `execute` para `authenticated` y no para `anon`, y la agenda con `('confirmado', 'cancelado')`.

**SQL** — _pendiente: correr `supabase/tests/hu10a_cancelar_turno.sql` en el SQL editor (necesita `postgres` para `set local role authenticated`)._

**En la app** (carlaperez@, Mesa de Entradas) — _pendiente: otorgar → cancelar → ver en agenda → ver el horario libre en disponibilidad._
