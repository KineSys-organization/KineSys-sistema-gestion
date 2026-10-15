# HU-16 — Consultar historial completo del paciente

Rama: `feat/hu-16-historial-paciente`. Issue: #16.

> Como Recepción o Profesional quiero ver el historial de un paciente (turnos, atenciones y pagos), para apoyar la atención y la gestión con información acumulada.

## Criterios

| # | Criterio | Estado |
|---|---|---|
| 1 | Recepción: sección Historial en `/pacientes/[id]` con todos los turnos (cualquier estado), del más reciente al más antiguo | ✅ |
| 2 | Cada turno: fecha, horario, profesional, servicio, estado, cobertura + link a `/turnos/[id]` | ✅ |
| 3 | Cancelado muestra motivo; reprogramado se ve con el horario vigente | ✅ |
| 4 | Estado de cobro, importe/medio si hay pago; reembolsado se indica | ✅ |
| 5 | Recepción no ve observaciones/motivo/ficha. Gerente ve si hay orden (link HU-24B); Mesa no | ✅ |
| 6 | Profesional: Historia clínica (ficha HU-39 arriba + Evolución = este historial) desde `/mi-agenda/[id]` | ✅ |
| 7 | Profesional ve turnos de todos los profesionales y, en atendidos, la atención; sin pagos | ✅ |
| 8 | Profesional sin turnos con el paciente → *No tenés turnos con este paciente* | ✅ |
| 9 | Resumen (total, atendidos, ausentes, cancelados), filtros fecha+profesional, página de 10 | ✅ |
| 10 | Sin turnos / filtros vacíos con mensajes claros; solo lectura; `fn_*` + permisos | ✅ |

## Backend

`supabase/migrations/033_hu16_historial_paciente.sql` (aplicada en el proyecto):

- `fn_consultar_historial_paciente(paciente, desde, hasta, profesional, pagina)`
- Recepción: `fn_es_recepcion` + vista `administrativa` (cobro vía `fn_estado_cobro`; `tiene_orden_medica` solo si es Gerente).
- Profesional: `fn_exigir_paciente_propio` + vista `clinica` (`atencion` en los atendidos; sin cobro).

## Front

- `src/lib/historial/` — tipos, validar (filtros), actions (`historial.consultar`).
- `src/components/historial/HistorialPaciente.tsx` — resumen, filtros, listado.
- En `/pacientes/[id]` los filtros van con prefijo `h` (`hdesde`, …) para no chocar con HU-24B.
- En `/historia-clinica/[paciente]` la Evolución usa el mismo componente (sin prefijo).

## Pruebas

- `npm test` (`tests/hu16-historial-paciente.test.mjs` + matriz HU-08).
- `supabase/tests/hu16_historial_paciente.sql` (rollback): Gerente/Mesa/Profesional, cobro, orden, filtro, permisos.
