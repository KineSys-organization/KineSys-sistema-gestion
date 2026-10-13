# HU-18 — Consultar dashboard operativo del centro

Issue: #18 · Incremento 3 · Solo Gerente.

## Alcance

- HU-26 conserva `/indicadores` como vista breve. Desde allí se abre `/indicadores/operativo`, manteniendo el período en la URL; ambas vistas comparten fechas por defecto y atajos.
- El dashboard muestra pacientes nuevos y recurrentes, ocupación total y tablas de turnos por profesional y servicio, con total y cantidad por estado.
- Los profesionales y servicios inactivos que tuvieron turnos en el período siguen visibles. El profesional inactivo se marca y la ocupación indica `Inactivo · no computa`.
- El color de estado usa fondos suaves azules, verdes, rojos y ámbar con texto oscuro de alto contraste, junto a la etiqueta y el conteo.

## Cálculos

- Turnos del rango: fechas inclusivas, sábados y domingos incluidos; cada turno cuenta en su estado actual.
- Ocupan minutos los turnos `confirmado`, `atendido` y `ausente`; `cancelado` se informa en el conteo, pero no suma ocupación.
- Minutos ocupados: suma los turnos que ocupan horario de todo el centro, aunque el profesional hoy esté inactivo. Minutos disponibles: suma las franjas semanales vigentes para cada día del rango y solo profesionales activos (perfil, usuario y rol Profesional).
- Ocupación = minutos ocupados / minutos disponibles. Si no hay minutos disponibles, se devuelve estado `sin_franjas` y porcentaje `null`; la interfaz muestra `Sin franjas`.
- El porcentaje puede superar 100% si las franjas vigentes son menores que las que había cuando se otorgaron los turnos. Los profesionales inactivos muestran sus minutos ocupados, pero no un porcentaje propio.
- Paciente nuevo: alta (`paciente.creado`, hora de Argentina) dentro del rango. Recurrente: creado antes del inicio y con al menos un turno en el rango; cuenta una vez.
- Período sin datos: contadores en cero y listas vacías, sin error.

## Archivos

- `supabase/migrations/20261013043429_hu18_dashboard_operativo.sql`: RPC `fn_consultar_dashboard_operativo(desde, hasta)`, protegida con `fn_exigir_rol(['Gerente'])`.
- `src/lib/indicadores/actions.ts` y `tipos.ts`: action protegida, tipos de respuesta.
- `src/app/(main)/indicadores/operativo/page.tsx`: vista server side en `/indicadores/operativo`, solo Gerente.
- `src/app/globals.css`: tablas y tonos de estado con contraste legible.
- `supabase/tests/hu18_dashboard_operativo.sql`: prueba de integración transaccional; termina en `rollback`.
- `tests/hu18-dashboard-operativo.test.mjs`: contratos de UI, ruta, permisos y criterios SQL.

## Validación

- Ejecutar `npm test` para pruebas unitarias y chequeos de acceso.
- Ejecutar `supabase/tests/hu18_dashboard_operativo.sql` en el SQL Editor luego de aplicar la migración. El guion revierte todos los datos de prueba.
- La migración de HU-18 debe aplicarse al proyecto Supabase del equipo al integrar la HU; no se aplica desde este cambio local.
