# HU-26 — Consultar indicadores generales del centro (vista corta, Incremento 2)

Rama: `feature/hu-26-indicadores`. Issue: #46. Depende de HU-04 (pacientes), HU-06 (otorgar), HU-10A (cancelado), HU-13 (atendido) y HU-10B (ausente, todavía abierta: el contador queda en 0 hasta que se integre).

> Como Gerente quiero ver un resumen numérico del centro en un período que yo elija, para saber volumen y estados de los turnos, y cuántos pacientes se dieron de alta, sin el dashboard completo de I3.

El 28/09 el PO redujo el alcance: ocupación, desglose por profesional/servicio y pacientes recurrentes pasaron a #18 (HU-18, Incremento 3).

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Solo el Gerente entra (Profesional y Mesa de Entradas no). Ruta `/indicadores` + `exigirGerente` / acción `indicadores.consultar` | ✅ |
| 2 | Elige Desde y Hasta (hora de Argentina). Desde no puede ser posterior a Hasta. Por defecto el mes calendario en curso | ✅ |
| 3 | Totales de turnos cuyo día cae en el período: total y por estado (Confirmado, Atendido, Cancelado, Ausente). Ausente en 0 hasta HU-10B | ✅ |
| 4 | Pacientes nuevos: altas con fecha de registro dentro del período (no "primer turno") | ✅ |
| 5 | Período sin datos: todos los números en cero, sin error | ✅ |
| 6 | No incluye ocupación, desglose por profesional o servicio, ni recurrentes (HU-18) | ✅ |
| 7 | No incluye importes ni medios de pago (HU-19) | ✅ |
| 8 | Datos por `fn_*`; sin `supabase.from` | ✅ |

## Flujo

1. Menú **Indicadores** (o la tarjeta de Inicio), visible solo para el Gerente.
2. `/indicadores` abre el **mes actual**. Se cambia con Desde/Hasta + **Ver indicadores** o con los atajos *Últimos 7 días*, *Este mes*, *Mes anterior*. El período queda en la URL (`?desde&hasta`).
3. `obtenerIndicadores` (server action) → `exigirAccion("indicadores.consultar")` → `validarPeriodo` → `fn_consultar_indicadores_generales`.
4. Se muestran **Turnos del período** y **Pacientes nuevos** destacados, y abajo **Turnos por estado** (confirmados, atendidos, cancelados, ausentes). Si la RPC falla se muestra su `error.message`.

## Backend — `supabase/migrations/013_hu26_indicadores_generales.sql`

Solo agrega una función de lectura; no crea ni modifica tablas.

`fn_consultar_indicadores_generales(p_desde date, p_hasta date) → jsonb`:

1. `fn_exigir_rol(array['Gerente'])` (usuario activo; Mesa, Profesional o una cuenta sin fila → *No tenés permisos para realizar esta acción*).
2. Validaciones: fechas obligatorias, `desde <= hasta`, período de hasta 366 días.
3. **Turnos**: los de `fecha` dentro del período (sábados y domingos incluidos), cada uno una vez en el estado que tiene al consultar.
4. **Pacientes nuevos**: `paciente.creado` (hora de Argentina) dentro del período.

```json
{
  "desde": "2026-09-01", "hasta": "2026-09-30",
  "turnos": { "total": 24, "confirmados": 11, "atendidos": 8, "cancelados": 5, "ausentes": 0 },
  "pacientes_nuevos": 10
}
```

## Front

- `src/lib/indicadores/tipos.ts`: tipos de la respuesta.
- `src/lib/indicadores/validar.ts`: `validarPeriodo`, `periodoPorDefecto`, `periodosRapidos`, `formatearFechaCorta` (lógica pura).
- `src/lib/indicadores/actions.ts`: `obtenerIndicadores`.
- `src/app/(main)/indicadores/page.tsx`: Server Component con `exigirGerente()`; sin `"use client"` (el filtro es un `<form method="get">`).
- `src/lib/auth/permisos.ts`: ruta `/indicadores` y acción `indicadores.consultar` (solo Gerente). Menú y tarjeta de Inicio.
- `globals.css`: `.indicadores-grid`, `.indicador*`.

## Pruebas

| Criterio | Prueba |
|---|---|
| 1 | SQL: Mesa de Entradas, Profesional y cuenta sin fila → bloqueados. Unit: matriz HU-08 con `/indicadores` e `indicadores.consultar`; la página usa `exigirGerente` y la action chequea antes de la RPC |
| 2 | SQL + unit: vacío, desde > hasta, más de un año, fechas inválidas; por defecto el mes en curso; un día solo |
| 3 | SQL: semana de marzo 2027 con un turno por estado (uno en sábado) y otro fuera del período → 4 totales, 1 por estado |
| 4 | SQL: paciente dado de alta dentro del período → 1 |
| 5 | SQL: enero 2020 → todo en 0 |
| 6 | SQL: la respuesta no trae `ocupacion` ni `profesionales`. Unit: ni la página ni la migración usan franjas u ocupación |
| 8 | Unit: la action no usa `.from(`; `grep .from(` en `src/` → 0 |

Con datos reales (septiembre 2026) los totales coinciden con un conteo directo sobre `turno` y `paciente`.

### Cómo correrlas

- `npm test` (incluye `tests/hu26-indicadores.test.mjs` y la matriz de `tests/hu08-acceso.test.mjs`).
- `supabase/tests/hu26_indicadores.sql` en el SQL Editor (todo termina en `rollback`).

## Aplicación

Migración `013` aplicada en el proyecto `dbfehkykxsqgpctskuuq` el 28/09/2026 (primero con ocupación y luego reemplazada por la vista corta con `create or replace`, misma firma).
