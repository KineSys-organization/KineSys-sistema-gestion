# HU-14 — Registrar y consultar pagos

**Como** Recepción, **quiero** registrar el pago de un turno y consultar los pagos existentes,
**para** llevar control de los ingresos asociados a cada atención.

Prioridad: Alta · Story points: 3 · Incremento 2 · Módulo: Pagos.

## Decisiones del equipo

- **Qué turnos se cobran:** se cobran turnos **confirmados o atendidos**. Si ya estaba pagado y después se cancela o se marca ausente, el pago se conserva.
- **Período del listado:** filtra por la **fecha en que se registró el pago** (hora de Argentina), no por la fecha del turno.

## Cómo funciona

| Dónde | Qué se hace |
|---|---|
| Detalle del turno (`/turnos/[id]`) | Bloque "Pago": "Registrar pago" o el importe cobrado con "Ver o corregir" |
| `/turnos/[id]/pago` | Registrar el cobro, ver el pago y su historial, "Corregir pago" |
| `/pagos` (menú "Pagos") | Listado: paciente, fecha del turno, servicio, importe, fecha del pago, medio y detalle |

### Al registrar un pago

- **Importe base:**
  - Viene precargado con el **precio actual del servicio** y se puede modificar.
  - Si el servicio no tiene precio, arranca vacío y es obligatorio.
- **Descuento:**
  - Aparece **solo si el turno tiene obra social**, y se ingresa a mano.
  - Si el turno es Particular, el descuento es 0.
- **Importe final:** se ve en vivo antes de guardar.
- **Medio:** Efectivo, Transferencia, Tarjeta de débito o Tarjeta de crédito.
- **Formato de los importes:** pesos con hasta 2 decimales, con coma o punto y sin separador de miles. Ejemplos: `15000` o `15000,50`.
- **Rechazos:**
  - Importe base vacío, en 0, negativo o con más de 2 decimales.
  - Descuento negativo, o que deja el final en 0 o menos.
  - Medio fuera de la lista.
- **Un solo pago por turno:** si ya existe, aparece *"Este turno ya tiene un pago registrado"*, con acceso a verlo o corregirlo.
  - Un doble clic o dos pestañas no duplican el pago: la base bloquea el turno mientras registra, y la tabla además tiene una restricción `unique`.

### Al corregir un pago

- **Qué se corrige:** el importe (base y descuento) y/o el medio. El motivo es obligatorio.
- **Validaciones:** las mismas que en el alta.
- **Mismo registro:** se corrige el **mismo** pago. El historial guarda los valores anteriores y los nuevos, el motivo, el usuario y la fecha.
- **No mueve dinero:** corregir no cobra ni devuelve nada, solo deja bien registrado lo que se cobró.

### Con otras acciones sobre el turno

- **Cancelar (HU-10A), marcar ausente (HU-10B) y reprogramar (HU-10C):** **no tocan el pago**, porque está en otra tabla y queda atado al mismo turno. No hay devolución automática; el reembolso es HU-22.
- **Si cambia el precio del servicio:** el pago no cambia, porque guarda sus propios importes.

## Base de datos (`017_hu14_pagos.sql`)

- **`pago`:**
  - Una fila por turno (`unique(id_turno)`), con paciente (copiado del turno), `importe_base`, `descuento`, `importe_final`, `medio_pago`, `registrado_en`, `registrado_por` y `corregido_en`.
  - Las restricciones `check` garantizan `final = base - descuento > 0`, un descuento de 0 o más y un medio de la lista.
- **`pago_correccion`:** el historial de cada corrección.
- **Funciones:**
  - `fn_obtener_pago`, `fn_registrar_pago`, `fn_corregir_pago` y `fn_listar_pagos`. Todas exigen rol de Gerente o Mesa de Entradas con `fn_exigir_rol`.
  - `fn_validar_importes_pago` es interna, con las reglas comunes al alta y la corrección.
- **Cerrado al front:** las tablas tienen RLS y no tienen grants, así que solo se accede por las `fn_*`.
- **Nada existente cambia:** no se modifica ninguna tabla ni función que ya existía.

## Archivos

- `supabase/migrations/017_hu14_pagos.sql` y `supabase/tests/hu14_pagos.sql`.
- `src/lib/pagos/validar.ts` (importes en centavos, medios, filtros), `tipos.ts` y `actions.ts`.
- `src/components/pagos/PagoForm.tsx`: alta y corrección, con el final en vivo.
- `src/app/(main)/turnos/[id]/pago/page.tsx`, `src/app/(main)/pagos/page.tsx` y el bloque "Pago" en `src/app/(main)/turnos/[id]/page.tsx`.
- Menú, tarjeta de Inicio y matriz de permisos (`/pagos` y las acciones `pagos.*` para Recepción y Gerente).

## Pruebas automáticas

- **`tests/hu14-pagos.test.mjs`:**
  - Medios de pago.
  - Lectura de importes en centavos.
  - Cálculo del final.
  - Rechazos del alta y de la corrección.
  - Precio sugerido.
  - Filtros del listado.
  - Chequeos de la migración: `unique`, `check`, lock, `fn_exigir_rol`, tablas cerradas y que no toque funciones existentes.
- **`tests/hu08-acceso.test.mjs`:** suma `/pagos`, `/turnos/[id]/pago` y las acciones `pagos.*`.
- **Resultados:** `npm test` 122/122 · `tsc --noEmit` sin errores · `next build` OK · `grep ".from(" src/` 0.
- **`supabase/tests/hu14_pagos.sql`** (correr en el SQL Editor, con rollback):
  - Consultar sin pago.
  - Registrar particular y con obra social.
  - Rechazar el segundo pago.
  - Importes, descuentos y medio inválidos.
  - No cobrar un turno cancelado.
  - Marcar ausente conserva el pago.
  - Corregir con historial.
  - Listado por paciente, DNI y período de la fecha del pago.
  - Permisos del Profesional y tablas cerradas.

## Prueba en el navegador (Mesa de Entradas)

- [ ] Detalle de un turno confirmado → "Registrar pago" → el importe viene con el precio del servicio.
- [ ] Turno con obra social: aparece el descuento y el final se actualiza al escribir.
- [ ] Registrar → mensaje "Pago registrado" y el pago aparece en el detalle del turno y en `/pagos`.
- [ ] Doble clic en "Registrar pago" o volver a entrar: no se duplica y aparece "Este turno ya tiene un pago registrado".
- [ ] Importes inválidos (0, `1.500`, descuento mayor al base) → mensaje de error.
- [ ] "Corregir pago" sin motivo → error; con motivo → historial con antes y después.
- [ ] Cancelar o marcar ausente un turno pagado → el pago sigue en el detalle y en el listado.
- [ ] `/pagos`: filtrar por paciente y por período. Hasta anterior a Desde → no deja filtrar. Sin resultados → "No hay pagos para esos filtros".
- [ ] Como Profesional: `/pagos` y `/turnos/[id]/pago` → vuelve a Inicio con el aviso de sin permiso.
