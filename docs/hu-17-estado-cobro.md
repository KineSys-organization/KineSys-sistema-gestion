# HU-17 — Estado de cobro de cada turno

**Como** Recepción o Gerente, **quiero** gestionar si el cobro de cada turno está pendiente o pagado,
**para** tener control real de la situación de cobro de cada turno.

Prioridad: Alta · Story points: 3 · Incremento 3 · Módulo: Pagos.

## Estados

| Estado | Cuándo |
|---|---|
| **Pendiente de pago** | Turno confirmado o atendido, sin pago |
| **Pagado** | Tiene pago (HU-14). Sigue Pagado aunque el turno después se cancele o se marque ausente |
| **Reembolsado** | Su pago tiene reembolso (HU-22) |
| **No corresponde cobro** | Turno cancelado o ausente, sin pago |

- **No se guarda.** Lo calcula la base con una sola regla, `fn_estado_cobro`.
- **Sale solo de la regla, sin código extra:**
  - Registrar el pago (HU-14) pasa el turno a Pagado. No hay un botón que cambie el estado sin cargar importe y medio.
  - Corregir una ausencia (HU-10B) de un turno sin pago lo vuelve a Pendiente.
- **Se muestra siempre con texto y color**, nunca solo con color (`EstadoCobroBadge`).

## Dónde se ve

- **Detalle del turno (`/turnos/[id]`):** el bloque "Pago" muestra "Estado de cobro: …". Si está Pendiente, aparece **Registrar pago** (lleva a la HU-14).
- **Pantalla de pago (`/turnos/[id]/pago`):** el estado de cobro en el resumen del turno.
- **Listado de turnos (`/turnos`):**
  - columna **Cobro**;
  - filtro **Estado de cobro** (Todos, Pendiente de pago, Pagado, Reembolsado, No corresponde cobro), combinable con los demás y que se conserva al paginar;
  - con el filtro Pendiente aparecen los atajos **Todos / Hasta hoy / Próximos**, que solo completan Desde y Hasta.
- **Pagos (`/pagos`):** botón **Ver pendientes de cobro**. Abre `/turnos` con el filtro Pendiente y sin límite de fechas; los más viejos sin cobrar quedan arriba.
- **Agenda de Recepción (`/agenda`), vistas Día y Semana:** columna **Cobro**.
- **Comprobante de pago (HU-35):** todavía no existe. `fn_obtener_pago` ya devuelve `turno.estado_cobro` para usarlo.

**El Profesional no lo ve:** `fn_obtener_turno` y la agenda le devuelven `estado_cobro: null`, y `/mi-agenda` no lo muestra.

## Base de datos (`024_hu17_estado_cobro.sql`)

- **`fn_estado_cobro(estado_turno, tiene_pago, tiene_reembolso)`:** la regla. Es interna y está revocada a `authenticated`.
- **Funciones reescritas:** cada una copia su última versión y solo agrega el estado de cobro.
  - `fn_obtener_turno` (019): `estado_cobro`, solo para Recepción.
  - `fn_consultar_agenda_profesional` (014): `estado_cobro` por turno, solo para Recepción.
  - `fn_buscar_turnos` (016): `estado_cobro` por fila y el parámetro nuevo `p_estado_cobro`. Se hace `drop` de la firma de 7 parámetros, para no dejar dos versiones.
  - `fn_obtener_pago` (023): `turno.estado_cobro`.
- **Sin tablas nuevas** ni cambios de datos.

## Pruebas automáticas

- **`tests/hu17-estado-cobro.test.mjs`:**
  - Estados y etiquetas.
  - Filtro y paginación.
  - Atajo de `/pagos` y atajos de período.
  - Chequeos de la migración: una sola regla, el Profesional recibe null y no quedan dos versiones de `fn_buscar_turnos`.
  - Pantallas.
- **`tests/hu09-buscar-turnos.test.mjs`:** suma el campo `cobro` a los filtros esperados.
- **`supabase/tests/hu17_estado_cobro.sql`** (con rollback):
  - Los 4 estados.
  - Pagar → Pagado.
  - Pagado y cancelado → sigue Pagado.
  - Ausente sin pago → No corresponde; corregido → Pendiente.
  - Reembolsado.
  - Filtro combinable y valor inválido.
  - Agenda de Recepción.
  - El Profesional sin estado de cobro.
  - Permisos y una sola `fn_buscar_turnos`.

## Prueba en el navegador

Con Mesa de Entradas:

- [ ] Turno confirmado sin pago: el detalle dice "Pendiente de pago" y tiene "Registrar pago".
- [ ] Registrar el pago → el detalle dice "Pagado".
- [ ] Cancelar o marcar ausente un turno pagado → sigue "Pagado".
- [ ] Un turno cancelado o ausente sin pago → "No corresponde cobro".
- [ ] Corregir una ausencia sin pago → vuelve a "Pendiente de pago".
- [ ] Un turno con reembolso → "Reembolsado".
- [ ] `/turnos`: columna Cobro. El filtro Estado de cobro se combina con Estado y se conserva al pasar de página.
- [ ] `/pagos` → "Ver pendientes de cobro" → `/turnos` con Pendiente. Probar los atajos Hasta hoy y Próximos.
- [ ] `/agenda`, vistas Día y Semana: columna Cobro.

Con el Profesional:

- [ ] En Mi agenda y en el detalle de su turno no aparece ningún estado de cobro.
