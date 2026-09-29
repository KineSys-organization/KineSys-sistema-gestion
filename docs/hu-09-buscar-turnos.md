# HU-09 — Buscar y filtrar turnos

Rama: `feature/turnos-ausencia-reprogramar-listado`. Issue: #9. Depende de HU-06, HU-01 (servicios) y HU-10B (estado Ausente).

> Como Recepción quiero buscar y filtrar turnos por paciente, profesional, servicio, fecha o estado, para ubicar rápidamente el turno sobre el que necesito operar.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Al entrar se ven los turnos de hoy (Desde = Hasta = hoy), por fecha y hora ascendente | ✅ |
| 2 | Paciente por DNI o por partes de nombre/apellido; nombre y apellido juntos exigen los dos | ✅ |
| 3 | Desplegable de profesional con "Todos" | ✅ |
| 4 | Desplegable de servicio (catálogo HU-01) con "Todos" | ✅ |
| 5 | Rango Desde/Hasta inclusivo; misma fecha = un día | ✅ |
| 6 | Hasta anterior a Desde se impide al elegir y al escribir a mano, con mensaje | ✅ |
| 7 | Estado: Confirmado, Cancelado, Atendido, Ausente y Todos | ✅ |
| 8 | Los filtros se combinan (AND) | ✅ |
| 9 | Cada fila: fecha, inicio y fin, paciente, DNI, profesional, servicio y estado | ✅ |
| 10 | 10 por página; paginar conserva filtros y orden; filtrar vuelve a la página 1 | ✅ |
| 11 | "Ver detalle" abre `/turnos/[id]` | ✅ |
| 12 | "Limpiar filtros" saca todo, también el rango, y lista todos los turnos paginados | ✅ |
| 13 | Sin resultados → lista vacía y *No se encontraron turnos con los filtros seleccionados*, sin error | ✅ |
| 14 | Solo Recepción y Gerente (HU-08) | ✅ |

## Flujo

- `/turnos` (menú **Turnos**). Formulario GET: los filtros viven en la URL (`q`, `profesional`, `servicio`, `desde`, `hasta`, `estado`, `pagina`). Así paginar, recargar o volver desde el detalle conserva la búsqueda.
- Primera entrada (sin `desde` ni `hasta` en la URL) → hoy. **Limpiar filtros** va a `/turnos?desde=&hasta=`: fechas vacías = sin límite.
- El formulario no manda `pagina`: filtrar siempre vuelve a la 1. Los links de paginación usan `urlTurnos(filtros, n)`.
- `RangoFechas` (cliente): `min`/`max` entre Desde y Hasta y `setCustomValidity`, así el navegador no deja enviar un rango al revés aunque se escriba a mano. La action y la base lo validan igual.

## Backend — `supabase/migrations/016_hu09_buscar_turnos.sql`

- `fn_buscar_turnos(p_texto, p_id_profesional, p_id_servicio, p_desde, p_hasta, p_estado, p_pagina)` → `{ total, pagina, por_pagina: 10, turnos }`.
- `fn_es_recepcion()`; rechaza Hasta < Desde, estado fuera de la lista y búsquedas de más de 100 caracteres.
- Texto: se parte en palabras y **cada una** tiene que coincidir con nombre, apellido o (si son dígitos) el comienzo del DNI. Usa `strpos` en vez de `ilike`, así `%` o `_` se buscan literalmente.
- Orden: fecha, hora de inicio y desempates fijos (apellido, nombre, id) para que las páginas no se mezclen.
- Un solo CTE (`coincidencias`) da el total y la página. Si la página no existe, la lista viene vacía con el total correcto.
- Solo agrega la función: no cambia tablas ni otras funciones.

## Front

- `src/lib/turnos/busqueda.ts` (lógica pura): `leerFiltrosTurnos`, `validarFiltrosTurnos`, `urlTurnos`, `totalPaginas`, `ESTADOS_FILTRO`.
- `src/lib/turnos/actions.ts`: `buscarTurnos`, `listarOpcionesFiltroTurnos` (acción `turnos.buscar`). El desplegable de profesionales incluye los inactivos, porque sus turnos siguen existiendo.
- `src/app/(main)/turnos/page.tsx`, `src/components/turnos/RangoFechas.tsx`.
- Menú e Inicio: **Turnos**. En `/turnos/nuevo` sigue resaltado "Otorgar turno".

## Pruebas

| Criterio | Prueba |
|---|---|
| 1/12 | Unit: `leerFiltrosTurnos({})` → hoy; `URL_TURNOS_SIN_FILTROS` → sin fechas |
| 2 | SQL: DNI exacto, comienzo de DNI, parte del nombre, "Zoilo TESTHUNO" (con espacios de más), nombre + apellido inexistente → 0, `%` literal |
| 3/4/7/8 | SQL: por profesional, por servicio, por estado (Ausente, "Todos") y todo combinado |
| 5/6 | Unit + SQL: misma fecha OK; Hasta < Desde → *La fecha Hasta no puede ser anterior a Desde* |
| 9 | SQL: el resultado trae todas las columnas |
| 10 | SQL: 12 turnos → 10 + 2, ordenados de 08:00 a 19:00 aunque se cargaron al revés; página fuera de rango vacía con el total. Unit: `urlTurnos` ida y vuelta, sin `pagina` en la 1 |
| 14 | SQL: Profesional → *No tenés permiso para consultar turnos*. Unit: matriz HU-08 con `/turnos` y `turnos.buscar` |

- **SQL:** `supabase/tests/hu09_buscar_turnos.sql` (con la 014 y la 016). Inserta sus propios pacientes (DNI 99090901/99090902) y turnos en una fecha lejana, y hace `rollback`.

## Evidencia (29/09/2026)

- **Migración:** 016 aplicada en Supabase (`016_hu09_buscar_turnos`).
- **SQL:** `hu09_buscar_turnos.sql` pasó completo.
- **Unitarias:** `npm test` → 93/93. **Tipos:** `tsc --noEmit` sin errores. `grep "\.from(" src/` → 0.
