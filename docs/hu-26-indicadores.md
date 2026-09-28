# HU-26 — Consultar indicadores generales del centro

Rama: `feature/hu-26-indicadores`. Issue: #46. Incremento 2. Depende de HU-02B (franjas), HU-06 (otorgar turno), HU-10A (cancelar) y HU-13 (atención), todas integradas.

> Como Gerente quiero ver indicadores generales del consultorio en un período que yo elija, para tomar decisiones sobre la operación del centro.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Con un rango desde/hasta elegido por el Gerente, se calculan los valores de ese período | ✅ |
| 2 | Cantidad de turnos: total registrados y por estado (atendidos, cancelados, ausentes) | ✅ |
| 3 | Tasa de ocupación = turnos ocupados / disponibilidad real según las franjas de cada profesional, general y por profesional | ✅ |
| 4 | Pacientes nuevos: dados de alta por primera vez dentro del período | ✅ |
| 5 | Un usuario que no es Gerente no puede acceder | ✅ |
| 6 | Un período sin datos se muestra en cero, sin error | ✅ |

## Flujo

1. Menú **Indicadores** (o la tarjeta de Inicio), visible solo para el Gerente.
2. `/indicadores` abre el **mes actual**. Se cambia con Desde/Hasta + **Ver indicadores** o con los atajos *Últimos 7 días*, *Este mes*, *Mes anterior*. El período queda en la URL (`?desde&hasta`).
3. `obtenerIndicadores` (server action) → `exigirAccion("indicadores.consultar")` → `validarPeriodo` → `fn_consultar_indicadores_generales`.
4. Se muestran las tarjetas (turnos registrados, atendidos, cancelados, ausentes, confirmados, pacientes nuevos), la ocupación general y la tabla por profesional con barra de ocupación. Si la RPC falla se muestra su `error.message`.

## Backend — `supabase/migrations/013_hu26_indicadores_generales.sql`

Solo agrega una función de lectura; no crea ni modifica tablas.

`fn_consultar_indicadores_generales(p_desde date, p_hasta date) → jsonb`:

1. `fn_exigir_rol(array['Gerente'])` (usuario activo; Mesa, Profesional o una cuenta sin fila → *No tenés permisos para realizar esta acción*).
2. Validaciones: fechas obligatorias, `desde <= hasta`, período de hasta 366 días.
3. **Turnos**: todos los turnos con `fecha` en el período; `total` y por estado (`confirmados`, `atendidos`, `cancelados`, `ausentes`).
4. **Ocupación** (en minutos):
   - *Disponibles*: cada franja semanal de un profesional activo se repite en los días del período con ese día de la semana (ISO 1–7, igual que la disponibilidad), **desde el día en que se cargó la franja**. Así un período anterior a las franjas no inventa disponibilidad.
   - *Ocupados*: turnos `confirmado`, `atendido` o `ausente`. El ausente reservó el horario aunque el paciente no vino; el cancelado lo liberó. Se suma solo la parte del turno que cae dentro de una franja, para que un turno que quedó afuera por una edición de franjas (HU-03) no pase del 100 %.
   - `porcentaje` = ocupados / disponibles × 100 (1 decimal); 0 si no hay disponibilidad.
   - Vista general (suma de todos) y desglose por profesional activo, ordenado por apellido.
5. **Pacientes nuevos**: pacientes con `creado` (hora de Argentina) dentro del período.

Respuesta:

```json
{
  "desde": "2026-09-21", "hasta": "2026-09-30",
  "turnos": { "total": 24, "confirmados": 11, "atendidos": 8, "cancelados": 5, "ausentes": 0 },
  "ocupacion": { "minutos_disponibles": 8940, "minutos_ocupados": 630, "porcentaje": 7 },
  "profesionales": [
    { "id_profesional": "…", "nombre_profesional": "Lucía", "apellido_profesional": "Fernández",
      "turnos": 13, "minutos_disponibles": 1620, "minutos_ocupados": 390, "porcentaje": 24.1 }
  ],
  "pacientes_nuevos": 10
}
```

### Decisiones

- **Ausentes**: marcar un turno como ausente es HU-10B (todavía abierta). El estado ya existe en la tabla, así que el indicador lo cuenta y da 0 hasta que se integre la 10B.
- **Profesionales inactivos**: no suman disponibilidad ni aparecen en el desglose (hoy no atienden). Sus turnos del período sí cuentan en los totales por estado.
- **Historial de franjas**: la base guarda solo las franjas vigentes. Si una franja se borra, deja de contar también para períodos pasados.

## Front

- `src/lib/indicadores/tipos.ts`: tipos de la respuesta.
- `src/lib/indicadores/validar.ts`: `validarPeriodo`, `periodoPorDefecto`, `periodosRapidos`, `formatearMinutos`, `formatearPorcentaje`, `formatearFechaCorta` (lógica pura).
- `src/lib/indicadores/actions.ts`: `obtenerIndicadores`.
- `src/app/(main)/indicadores/page.tsx`: Server Component con `exigirGerente()`; sin `"use client"` (el filtro es un `<form method="get">`).
- `src/lib/auth/permisos.ts`: ruta `/indicadores` y acción `indicadores.consultar` (solo Gerente). Menú y tarjeta de Inicio.
- `globals.css`: `.indicadores-grid`, `.indicador*`, `.barra-ocupacion`.

## Pruebas

| Criterio | Prueba |
|---|---|
| 1, 2, 4 | SQL: semana armada en marzo 2027 con 4 turnos (uno por estado) y un paciente nuevo → conteos exactos |
| 3 | SQL: ocupados = 90 min (atendido + confirmado + ausente; el cancelado no suma), disponibles = franjas del profesional, porcentaje y total general |
| 5 | SQL: Mesa de Entradas, Profesional y cuenta sin fila → bloqueados. Unit: matriz HU-08 con `/indicadores` e `indicadores.consultar`; la página usa `exigirGerente` |
| 6 | SQL: enero 2020 → turnos, pacientes, disponibilidad y porcentaje en 0 |
| Período | SQL + unit: vacío, desde > hasta, más de un año, fechas inválidas |

Además, con los datos reales (21 al 30/09/2026) los minutos ocupados por profesional coinciden con una consulta independiente sobre `turno` (120, 390 y 120 min).

### Cómo correrlas

- `npm test` (incluye `tests/hu26-indicadores.test.mjs` y la matriz de `tests/hu08-acceso.test.mjs`).
- `supabase/tests/hu26_indicadores.sql` en el SQL Editor (todo termina en `rollback`).

## Aplicación

Migración `013_hu26_indicadores_generales` aplicada en el proyecto `dbfehkykxsqgpctskuuq` el 28/09/2026.
