# HU-21 — Registrar cobro mediante billetera virtual (#21)

Decisión del equipo (refinamiento I3): **sin integración con APIs**. El centro cobra con su QR o
alias (configurados fuera del sistema), Recepción comprueba el cobro en la app de la billetera y
lo registra en KineSys como un pago de HU-14.

## Qué cambia

- La lista de medios suma **Billetera virtual** (Mercado Pago, MODO, Ualá, etc.).
- En `/turnos/[id]/pago`, al elegir Billetera virtual aparece **Nº de operación** (obligatorio,
  4..50 letras y/o números, sin espacios). Con otros medios el campo no aparece.
  Mensajes: *Ingresá un número de operación válido* / *Ese número de operación ya está
  registrado en otro pago*.
- Importes, descuento, "un pago por turno" y doble envío: sin cambios (HU-14).
- El nº se ve en el detalle del pago y en `/pagos`, que suma el filtro **Medio**.
- **Corregir pago**: hacia billetera el nº es obligatorio; desde billetera el nº se quita; el
  historial guarda el nº anterior y el nuevo.
- Un pago con billetera se puede reembolsar (HU-22); el medio de devolución admite billetera
  (la devolución en sí se hace fuera del sistema).
- Solo Recepción y Gerente (`pagos.*`).

## Base de datos (`supabase/migrations/028_hu21_billetera_virtual.sql`)

- `pago.medio_pago` suma `billetera`; `pago.numero_operacion` con check de formato, check
  *billetera ⇔ nº* y único `idx_pago_numero_operacion` (sin distinguir mayúsculas).
- `pago_correccion.numero_operacion_anterior / _nuevo`; `reembolso.medio_devolucion` suma
  `billetera`.
- `fn_validar_numero_operacion` (interna). `fn_registrar_pago`, `fn_corregir_pago` (+
  `p_numero_operacion`) y `fn_listar_pagos` (+ `p_medio`) con **drop + create**;
  `fn_obtener_pago`, `fn_validar_importes_pago` y `fn_registrar_reembolso` recreadas.

## Pruebas

- SQL con rollback: `supabase/tests/hu21_billetera_virtual.sql` (registro, falta el nº, formato,
  repetido, corrección hacia y desde billetera, listado, reembolso, Profesional bloqueado,
  checks de la tabla).
- `npm test`: `tests/hu21-billetera-virtual.test.mjs` (+ `hu14` y `hu22` actualizados).

Fuera de alcance: APIs de billeteras, links de pago, QR generados por el sistema, webhooks y
verificación automática.
