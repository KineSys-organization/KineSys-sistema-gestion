# HU-24B — Historial de órdenes médicas del paciente (#45)

## Pantallas

- **Gerente:** sección **Órdenes médicas** al pie de `/pacientes/[id]`. Mesa de Entradas usa la
  misma página pero no ve la sección (`puedeHacer(rol, "ordenes.consultar")`).
- **Profesional:** botón **Historial de órdenes** en `/mi-agenda/[id]` →
  `/mi-agenda/[id]/ordenes` (el paciente sale del turno propio; el Profesional no entra a
  `/pacientes`).
- Filtros por GET en la URL: Desde / Hasta (fecha del turno, `RangoFechas` impide Hasta < Desde)
  y Profesional ("Todos" por defecto, lista con los profesionales que le dieron órdenes).
  **Limpiar filtros** vuelve a la URL sin parámetros.
- Cada orden: fecha y hora del turno, profesional (con matrícula), servicio, cobertura del
  turno, sesiones (*No informadas* en las de HU-24A), detalle, fecha de registro y, si se
  editó, *Editada*. Botón **Imprimir / PDF** por orden (mismo formato de HU-38; solo se imprime
  la elegida).
- Vacío: *Este paciente no tiene órdenes médicas registradas* / *No hay órdenes para esos filtros*.

## Base de datos (`supabase/migrations/026_hu24b_historial_ordenes.sql`)

`fn_listar_ordenes_paciente(paciente, desde, hasta, profesional)` → `{ paciente, profesionales,
total_sin_filtros, ordenes }`.

- `fn_exigir_rol(['Gerente','Profesional'])`; si es Profesional, `fn_exigir_paciente_propio`
  (HU-39): *No tenés turnos con este paciente*. Mesa → *No tenés permisos para realizar esta acción*.
- Lee `atencion` por `id_paciente` con `orden_medica is not null`, orden `fecha desc, hora desc`.
- No devuelve observaciones ni motivo de consulta.
- Acción nueva `ordenes.consultar` (Gerente + Profesional) en `permisos.ts`.

## Pruebas

- SQL con rollback: `supabase/tests/hu24b_historial_ordenes.sql` (orden, sesiones viejas,
  filtros, rango inválido, vacío, sin datos clínicos, Profesional con y sin turnos, Mesa bloqueada).
- `npm test`: `tests/hu24b-historial-ordenes.test.mjs` y `tests/hu08-acceso.test.mjs`.
