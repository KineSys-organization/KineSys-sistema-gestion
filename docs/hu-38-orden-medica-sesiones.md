# HU-38 — Orden médica con datos automáticos, sesiones y detalle (#72)

Corrección de la revisión del Incremento 2 sobre HU-24A: la orden médica deja de ser un único
texto libre.

## Qué cambia

- En `/mi-agenda/[id]` (registrar y editar atención) el recuadro **Orden médica** muestra, de
  solo lectura, paciente (nombre, apellido, DNI), cobertura del turno (obra social y nº de
  afiliado, o Particular), profesional (con matrícula), servicio y fecha del turno.
- El profesional completa solo **Cantidad de sesiones** (1..50) y **Detalle de la orden**
  (1..2000). La orden sigue siendo opcional: vacíos los dos = sin orden.
- Mensajes: *Indicá la cantidad de sesiones*, *Completá el detalle de la orden*,
  *La cantidad de sesiones tiene que ser entre 1 y 50*.
- Con **Editar atención** se corrigen sesiones y detalle, o se quita la orden (vaciar los dos).
- La orden registrada se imprime / descarga en PDF (`OrdenMedica` + `ImprimirOrdenButton`,
  mismo mecanismo que HU-27, sin librerías nuevas): logo, datos automáticos, sesiones, detalle,
  fecha de registro y espacio para firma.

## Base de datos (`supabase/migrations/025_hu38_orden_medica_sesiones.sql`)

- `atencion.orden_sesiones smallint` con `check` 1..50 y `check` *sesiones ⇒ detalle*.
  `atencion.orden_medica` pasa a ser el detalle.
- Órdenes viejas (HU-24A) quedan con sesiones `null` → se ven como *Sesiones: no informadas*.
  Al editar la atención se pueden dejar como están; si se cambia el detalle, se piden sesiones.
- `fn_registrar_atencion` / `fn_editar_atencion` suman `p_orden_sesiones integer default null`
  con **drop + create** (una sola versión de cada una).
- `fn_obtener_turno` suma `matricula_profesional` y, dentro de `atencion` (solo el profesional
  que atendió), `orden_sesiones`, `orden_cobertura` y `orden_numero_afiliado`. Recepción sigue
  recibiendo `atencion: null`.
- El front no manda ningún dato del paciente: los lee de la base al mostrar la orden.

## Pruebas

- SQL con rollback: `supabase/tests/hu38_orden_medica_sesiones.sql` (sin orden, completa,
  detalle sin sesiones, sesiones sin detalle, fuera de rango, editar y quitar, orden vieja,
  Mesa no la ve, checks de la tabla). `supabase/tests/hu24a_orden_medica.sql` se ajustó para
  mandar sesiones.
- `npm test`: `tests/hu38-orden-medica-sesiones.test.mjs` (+ `tests/hu24a-orden-medica.test.mjs`
  actualizado).

Fuera de alcance: descontar sesiones usadas con los turnos que se dan.
