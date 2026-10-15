# HU-35 — Comprobante de pago

**Como** Recepción (Mesa de Entradas o Gerente), **quiero** emitir el comprobante de un pago registrado y consultar los comprobantes ya emitidos,
**para** entregarle al paciente una constancia del cobro y poder reimprimirla cuando la pida.

## Decisiones del equipo

- **Fecha de emisión:** es la fecha y hora en que se registró el pago, en hora de Argentina. Queda fija, así que al reimprimir el comprobante sale igual.
- **Saltos en la numeración:** el número sale de una secuencia de la base y puede tener saltos. Por ejemplo, un doble envío que la base rechaza consume un número. Como el comprobante es una **constancia interna, no una factura fiscal** (AFIP/ARCA queda fuera de alcance), no hace falta numeración sin huecos.
  - Lo que sí se garantiza: el número **nunca se repite**, **nunca cambia** (ni al corregir el pago) y **va en orden**.
- **Pago reembolsado:** "Ver comprobante" sigue disponible y muestra "Reembolsado el … por $ X".

## Qué tiene el comprobante

- **Encabezado:** logo de KineSys, "KineSys" y "Consultorio de kinesiología".
- **Número y emisión:** número correlativo (`0000123`) y "Emitido el …".
- **Paciente:** nombre, apellido y DNI.
- **Turno:** fecha, horario, profesional, servicio y estado del turno.
- **Cobertura:** obra social y nº de afiliado, o Particular.
- **Pago:** importe base, descuento e importe final en pesos (`$ 12.345,67`), medio de pago, estado de cobro (HU-17: Pagado o Reembolsado) y usuario que registró el cobro.
- **Leyendas:**
  - "Corregido el …": muestra los datos vigentes y conserva el mismo número.
  - "Reembolsado el … por $ X".
- **Pie:** "Constancia interna de cobro. No válida como factura."

**Descargar PDF:** usa la impresión del navegador, igual que el PDF de horarios de la HU-27, sin librerías nuevas. El archivo se sugiere como `Comprobante 0000123 - Pérez, Juan`, y al imprimir solo sale el comprobante.

**No se guarda como archivo:** se arma cada vez con los datos de la base.

## Dónde se ve

- **`/turnos/[id]/pago`:**
  - al registrar, "Pago registrado. Comprobante Nº …" con **Ver comprobante** y **Descargar PDF**;
  - después, **Ver comprobante** queda siempre en el pago.
- **`/turnos/[id]`:** si el turno tiene pago, **Ver comprobante**.
- **`/pagos`:**
  - columna **Nº** y **Ver comprobante** en cada fila;
  - búsqueda **Nº de comprobante** (acepta `123` o `0000123`), combinable con paciente, período y reembolso.
- **Turno sin pago:** no hay comprobante. La base responde "El comprobante no existe".
- **Billetera virtual (HU-21):** si el pago fue con billetera, el comprobante muestra el **nº de operación**.

## Base de datos (`025_hu35_comprobante_pago.sql`)

- **Número:**
  - Secuencia `pago_numero_comprobante_seq` y columna `pago.numero_comprobante` (unique, not null, mayor que 0).
  - Los pagos que ya existían se numeraron en orden de `registrado_en`.
  - Los nuevos reciben el número por el default de la columna, así que `fn_registrar_pago` no cambia.
  - La secuencia está revocada al front.
- **`fn_obtener_comprobante(id_pago)`** (nueva): todos los datos, con el estado de cobro de la regla de la HU-17.
- **`fn_obtener_pago`** (versión 024) suma `pago.numero_comprobante`.
- **`fn_listar_pagos`** (versión 023) suma `numero_comprobante` y el filtro `p_numero_comprobante`. Se hace `drop` de la firma de 5 parámetros, para no dejar dos versiones.
- **Permisos:** solo Gerente y Mesa de Entradas (`fn_exigir_rol`).

## Unificación con la HU-21 (`029_unificar_pagos_hu21_hu35.sql`)

La 025 (esta HU) y la 028 (HU-21, billetera virtual) recreaban cada una su propia `fn_listar_pagos` y quedaban **dos versiones** en la base. `/pagos` daba error: *Could not choose the best candidate function*. La 029 deja una sola versión de cada función, con lo de las dos HU:

- `fn_listar_pagos`: filtros por medio (HU-21) y por nº de comprobante (HU-35), combinables.
- `fn_obtener_pago`: nº de comprobante, nº de operación y estado de cobro (HU-17).
- `fn_obtener_comprobante`: suma el nº de operación.

En la base compartida, el arreglo de `fn_listar_pagos` y `fn_obtener_pago` ya se aplicó el 15/10/2026. Volver a correr la 029 es seguro.

## Pruebas automáticas

- **`tests/hu35-comprobante.test.mjs`:**
  - Formato `0000123`.
  - Búsqueda por número.
  - Título del PDF y links.
  - Chequeos de la migración.
  - Pantallas.
  - Sin dependencias nuevas.
- **`tests/hu14-pagos.test.mjs` y `tests/hu08-acceso.test.mjs`:** suman el filtro `numero` y la ruta del comprobante.
- **`supabase/tests/hu35_comprobante_pago.sql`** (con rollback):
  - Pagos existentes numerados sin repetir.
  - Un pago nuevo recibe el número siguiente.
  - Datos del comprobante, particular y con obra social.
  - Corregir mantiene el número.
  - Comprobante de un pago reembolsado.
  - Sin pago no hay comprobante.
  - Búsqueda por número, combinable.
  - El Profesional no puede verlo.
  - Una sola `fn_listar_pagos`.

## Prueba en el navegador

Con Mesa de Entradas:

- [ ] Registrar un pago → "Pago registrado. Comprobante Nº …" con Ver comprobante y Descargar PDF.
- [ ] Ver comprobante: logo, KineSys, número, emitido el, paciente, turno, cobertura, importes, medio, estado del turno, estado de cobro "Pagado" y quién cobró.
- [ ] Descargar PDF: el diálogo sugiere "Comprobante 0000XXX - Apellido, Nombre" y la vista previa muestra solo el comprobante.
- [ ] Turno con obra social: muestra la obra, el nº de afiliado y el descuento.
- [ ] Pago con **Billetera virtual**: el comprobante muestra el **Nº de operación**. Uno en efectivo no lo muestra.
- [ ] `/pagos`: filtro **Medio** + **Nº de comprobante** juntos.
- [ ] Corregir el pago → el comprobante tiene el mismo número, los datos nuevos y "Corregido el …".
- [ ] Reembolsar → el comprobante dice "Reembolsado el … por $ X" y el estado de cobro "Reembolsado".
- [ ] `/pagos`: columna Nº y "Ver comprobante". Buscar por `123` y por `0000123`, y combinarlo con paciente.
- [ ] Detalle de un turno pagado → Ver comprobante. Un turno sin pago no lo muestra.

Con el Profesional:

- [ ] Entrar a `/pagos/<id>/comprobante` → vuelve a Inicio con el aviso de sin permiso.
