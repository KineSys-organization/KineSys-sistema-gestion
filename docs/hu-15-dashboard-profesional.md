# HU-15 — Consultar dashboard del profesional

Rama: `feature/hu-15-dashboard-profesional`. Issue: #15. Depende de HU-12/HU-13 (agenda propia y atendido), HU-10A (cancelado) y HU-10B (ausente), todas ya en `main`.

> Como Profesional quiero ver un resumen de mi actividad del día/semana y un calendario mensual de mis turnos, para entender rápido la carga y ubicar los días en los que tengo turnos.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | En `/` (Inicio) el Profesional ve contadores de **su** día: total, atendidos y pendientes (confirmados sin atender) | ✅ |
| 2 | Sin actividad, los contadores van en cero, sin error | ✅ |
| 3 | Solo ve su dashboard: el id sale de `auth.uid()`, nunca de la URL ni de un selector | ✅ |
| 4 | Semana actual (lunes a domingo, hora de Argentina): cancelaciones y ausencias **suyas** | ✅ |
| 5 | Calendario mensual con sus turnos en el día que corresponde; mes anterior y siguiente | ✅ |
| 6 | Al elegir un día se listan sus turnos por hora de inicio (hora, paciente, servicio, estado) y cada uno abre `/mi-agenda/[id]` | ✅ |
| 7 | Color por proximidad en los confirmados; el color no es el único indicador (fecha, hora y estado en texto) | ✅ |
| 8 | Un mes sin turnos se muestra vacío, sin error | ✅ |
| 9 | Sábado y domingo se muestran; si hay turnos aparecen, si no quedan vacíos | ✅ |
| 10 | Recepción y Gerente no ven este dashboard (usan `/agenda`) | ✅ |

## Reglas de negocio

- **Turnos de hoy**: los del día sin contar los cancelados. **Atendidos**: estado `atendido`. **Pendientes**: estado `confirmado` (todavía sin atención).
- **Semana**: la que contiene a hoy en `America/Argentina/Buenos_Aires`, de lunes a domingo. Cancelaciones y ausencias se cuentan por el día del turno.
- **Proximidad** (confirmados, respecto de hoy): hoy rojo · 1 a 3 días naranja · 4 a 7 días verde · más de 7 días azul. Atendidos, cancelados, ausentes o confirmados ya pasados: gris.

## Flujo

1. El Profesional entra a Inicio. Arriba sigue el resumen del día de HU-12 ("Atender al próximo").
2. Debajo: cinco contadores (hoy y semana) y el calendario del mes actual.
3. Mes anterior / siguiente / Mes actual y el día elegido quedan en la URL (`/?mes=2026-10&dia=2026-10-05`). Un mes o día inválido en la URL vuelve al mes actual, sin error.
4. Cada día muestra hasta 3 turnos (hora + estado, borde con el color); el resto se ve al elegir el día.
5. La lista del día muestra horario, fecha y "En N días / Hoy / Hace N días", paciente, servicio, estado y el link **Ver turno** a `/mi-agenda/[id]`.

## Backend — `supabase/migrations/017_hu15_dashboard_profesional.sql`

Solo agrega una función de lectura; no crea ni modifica tablas.

`fn_consultar_dashboard_profesional(p_mes date default null) → jsonb`:

1. `fn_exigir_rol(array['Profesional'])`; el profesional es `auth.uid()` (no hay parámetro de profesional).
2. `p_mes`: cualquier día del mes a mostrar; `null` = mes de hoy.
3. Devuelve:

```json
{
  "hoy": "2026-09-29",
  "dia": { "total": 0, "atendidos": 0, "pendientes": 0 },
  "semana": { "desde": "2026-09-28", "hasta": "2026-10-04", "cancelaciones": 10, "ausencias": 0 },
  "mes": { "desde": "2026-09-01", "hasta": "2026-09-30", "turnos": [
    { "id_turno": "…", "estado": "atendido", "fecha": "2026-09-24", "hora_inicio": "19:00", "hora_fin": "19:30",
      "nombre_paciente": "Amparo", "apellido_paciente": "Serrano", "nombre_servicio": "Evaluación inicial" }
  ] }
}
```

## Front

- `src/lib/dashboard/tipos.ts`: tipos de la respuesta.
- `src/lib/dashboard/calendario.ts`: `armarMes`, `proximidad`, `textoProximidad`, `diaElegido`, `sumarMeses`, `urlDashboard` (lógica pura).
- `src/lib/dashboard/actions.ts`: `consultarDashboard(mes)` → `exigirAccion("atencion.dashboard")` → RPC.
- `src/components/dashboard/DashboardProfesional.tsx`: contadores, calendario y lista del día (Server Component).
- `src/app/(main)/page.tsx`: lo muestra solo si el rol es Profesional.
- `src/lib/auth/permisos.ts`: acción `atencion.dashboard` (solo Profesional).
- `globals.css`: `.dia-mes*`, `.turno-chip`, `.prox-*`, `.referencias-proximidad`.

## Pruebas

| Criterio | Prueba |
|---|---|
| 1, 2 | SQL: se cargan hoy un turno por estado → total +3, atendidos +1, pendientes +1 (se compara antes/después) |
| 3 | SQL: otro profesional no ve el turno ajeno. Unit: la action no manda `id_profesional`; la migración usa `auth.uid()` |
| 4 | SQL: cancelado y ausente de hoy → +1 cada uno; el cancelado de otro profesional no cuenta; la semana es lunes a domingo con hoy adentro |
| 5, 9 | SQL: marzo 2027 trae el turno de prueba. Unit: `armarMes` arma semanas de lunes a domingo, con el sábado y sus turnos |
| 6 | Unit: cada turno del día enlaza a `/mi-agenda/[id]`; `diaElegido` |
| 7 | Unit: `proximidad` en los bordes (0, 1, 3, 4, 7, 8 días) y gris para atendido, cancelado, ausente y pasado; `textoProximidad` |
| 8 | SQL: enero 2020 → lista vacía. Unit: `armarMes` de un mes sin turnos |
| 10 | SQL: Mesa de Entradas, Gerente y cuenta sin fila → *No tenés permisos*. Unit: matriz HU-08 con `atencion.dashboard`; Inicio solo lo muestra al Profesional |

Verificación visual (29/09/2026, Profesional Juarez, Agustin): contadores de hoy y de la semana, septiembre con los atendidos/cancelados en gris, octubre con turnos confirmados de prueba en naranja, verde y azul (borrados después), mes vacío y parámetros inválidos. Con Mesa de Entradas el Inicio no muestra el calendario.

### Cómo correrlas

- `npm test` (incluye `tests/hu15-dashboard.test.mjs` y la matriz de `tests/hu08-acceso.test.mjs`).
- `supabase/tests/hu15_dashboard_profesional.sql` en el SQL Editor (todo termina en `rollback`).

## Aplicación

Migración `017` aplicada en el proyecto `dbfehkykxsqgpctskuuq` el 29/09/2026.
