# HU-36 — Calendario del profesional: colores por estado e íconos de proximidad

Issue: #70. Actualiza la presentación del calendario de HU-15 sin modificar funciones ni migraciones.

## Comportamiento

- El estado determina el color: confirmado azul, atendido verde, ausente naranja y cancelado gris.
- Los turnos confirmados de hoy o futuros muestran un ícono de proximidad: alarma para hoy, cronómetro de 1 a 3 días, calendario semanal de 4 a 7 días y calendario con flecha para más de 7 días.
- Los turnos atendidos, cancelados, ausentes y confirmados pasados no muestran ícono de proximidad.
- La leyenda separa colores y proximidad. Los íconos tienen texto accesible; el turno conserva hora y estado en texto.
- La lista del día usa la misma regla. `EstadoTurnoBadge` comparte los colores en `/agenda`, `/mi-agenda` y `/turnos`.

## Implementación

- `src/lib/dashboard/calendario.ts`: lógica pura `colorPorEstado` y `proximidad`.
- `src/components/dashboard/DashboardProfesional.tsx`: íconos SVG propios, calendario y lista diaria.
- `src/components/turnos/EstadoTurnoBadge.tsx`: paleta compartida por las agendas.
- No agrega librerías, tablas, RPC ni migraciones.

## Verificación

- `npm test`: cubre colores por estado, límites de proximidad (0, 1, 3, 4, 7 y más de 7 días) y ausencia de ícono en estados/fechas excluidos.
- Build de producción para comprobar el render de los SVG y tipos.
