# HU-05 — Consultar horarios disponibles

Rama: `feature/hu-05-disponibilidad`. Issue: #5.

## Implementación

- `/disponibilidad`: recepción elige profesional, servicio y fecha.
- RPC `fn_consultar_disponibilidad`: franjas del día ISO × duración/granularidad − turnos confirmados (estado `confirmado` desde HU-06; antes `otorgado`).
- Sin franjas / sin slots → mensaje *No hay horarios para esa fecha*.
- No fechas pasadas; máximo hoy+30.
- Solo profesional activo con servicio asociado.
- Tabla `turno` mínima para ocupación (alta = HU-06).

## Migración

`supabase/migrations/004_hu05_disponibilidad.sql`
