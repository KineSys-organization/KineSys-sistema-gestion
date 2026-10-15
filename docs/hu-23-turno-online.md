# HU-23 — Sacar turno online / Autogestión del paciente

> **Como** Paciente **quiero** sacar un turno online consultando disponibilidad **para** no depender de Recepción para agendar.

La HU estaba parqueada sin criterios. Este documento fija el alcance implementado y las decisiones tomadas; lo que dice "a confirmar con el PO" queda abierto.

## Alcance

| Pantalla | Qué hace |
|---|---|
| `/portal/ingresar` | Ingreso del paciente con mail y contraseña (Supabase Auth). Aparte de `/login` (gestión). |
| `/portal` | **Mis turnos**: próximos (con **Cancelar turno**) y los últimos 20 anteriores. |
| `/portal/nuevo` | **Sacar turno**: 1 servicio → 2 profesional → 3 día y horario (calendario de 30 días) → 4 cobertura y confirmar. |

Desde `/login` hay un link "¿Sos paciente? Sacá tu turno online" y desde el portal uno de vuelta ("Soy del personal del centro").

## Criterios de aceptación

### Ingreso

- [x] El paciente entra con su cuenta de Auth en `/portal/ingresar`. Mail vacío / inválido / sin contraseña → validación, sin pegarle a Auth. Auth falla → *Mail o contraseña incorrectos*.
- [x] Si la cuenta no es de un paciente con ficha activa, se cierra la sesión y se muestra el mensaje de la base:
  - sin ficha → *No encontramos tu ficha de paciente. Pedile a Recepción que registre tu mail*
  - más de una ficha con ese mail → *Hay más de una ficha de paciente con tu mail. Comunicate con Recepción*
  - ficha inactiva (HU-34) → *Tu ficha de paciente está inactiva. Comunicate con el centro*
  - usuario de gestión (Gerente, Profesional, Mesa) → *El turno online es solo para pacientes. Usá el sistema de gestión*
- [x] Sin sesión, cualquier `/portal/*` manda a `/portal/ingresar` (no a `/login`). Con sesión de paciente, `/portal/ingresar` manda a `/portal`.
- [x] El paciente sigue sin poder entrar al sistema de gestión (`fn_acceso_gestion` no cambió).

### Sacar turno

- [x] Paso 1: servicios activos que tienen al menos un profesional activo **con franjas**. Muestra duración y el precio particular de referencia.
- [x] Paso 2: profesionales que prestan ese servicio. Si hay uno solo, se saltea.
- [x] Paso 3: calendario de los próximos 30 días con la cantidad de horarios libres por día, y los horarios del día elegido. Mismo cálculo que Recepción (HU-05): franjas, duración y granularidad, turnos que ocupan, bloqueos de agenda (HU-33) y nada en el pasado.
- [x] Paso 4: cobertura (obras sociales **activas** del paciente o Particular; una sola → preseleccionada) y **Confirmar turno**.
- [x] Al confirmar, la base revalida el horario con el mismo lock y la misma `EXCLUDE` que HU-06. Si se ocupó: *El horario seleccionado ya no está disponible* + link "Elegir otro horario".
- [x] El paciente no puede tener dos turnos confirmados superpuestos: *Ya tenés un turno en ese horario*.
- [x] El turno queda `confirmado`, prioridad **Normal** (HU-20 la decide Recepción) y `origen = 'online'`.
- [x] Todo lo elegido queda en la URL (`?servicio&profesional&fecha&hora`): recargar o "Cambiar" no pierde nada.
- [x] Después de confirmar → "Mis turnos" con *Listo, tu turno quedó confirmado: …*

### Mis turnos y cancelar

- [x] Próximos = confirmados que todavía no terminaron. Anteriores = el resto (últimos 20). Fecha, horario, servicio, profesional, cobertura y estado.
- [x] **Cancelar turno** (con confirmación) solo en un turno propio, confirmado y que no empezó (mismo criterio que HU-10A). Queda `cancelado` con motivo *Pedido del paciente* y detalle *Cancelado por el paciente desde el turno online*. El horario se libera. El pago (si hubiera) no se toca.
- [x] Turno ajeno o inexistente → *El turno no existe o no es tuyo* (no se revela cuál). Ya empezó → *El turno ya empezó; comunicate con Recepción*.

### Lo que el paciente NO ve

- [x] Nada clínico (atención, observaciones, orden médica, historia clínica), ni pagos, ni prioridad, ni el motivo interno de los bloqueos por horario.

### Recepción

- [x] Los turnos online aparecen en `/agenda`, `/turnos` y `/turnos/[id]` como cualquier otro, y Recepción puede cancelar, reprogramar, marcar ausencia o cobrar igual que siempre.

## Cómo se identifica al paciente

Lo decide la base en `fn_paciente_actual()` con `auth.uid()`; el front **nunca** manda el id del paciente:

1. la ficha cuyo `id_paciente = auth.uid()`, o
2. la ficha cuyo `mail_paciente` (HU-04) coincide con el mail **confirmado** de la cuenta (`auth.users.email_confirmed_at` no nulo, sin distinguir mayúsculas).

Por eso, para que un paciente use el turno online, Recepción tiene que tener su mail cargado en la ficha (HU-04). El alta de la cuenta del paciente (registro / contraseña) **no** es parte de esta HU: se hace como hasta ahora, fuera de este sistema.

> Riesgo conocido: si en Supabase Auth el registro público está abierto **y** la confirmación de mail está desactivada, alguien podría crear una cuenta con el mail de otro paciente. Con confirmación de mail activa (default de Supabase) no pasa. Revisar esa configuración antes de publicar el portal.

## Base de datos

Migración `supabase/migrations/034_hu23_turno_online.sql` (**no modifica ninguna función existente**):

| Objeto | Para qué |
|---|---|
| `turno.origen` (`recepcion` por defecto \| `online`) | Registrar por dónde se sacó el turno. |
| `fn_paciente_actual()` *(interna, revocada)* | Paciente de la sesión (ver arriba). |
| `fn_paciente_turno_json(uuid)` *(interna, revocada)* | Un turno como lo ve el paciente. |
| `fn_acceso_paciente()` | Ingreso: datos del paciente + obras sociales activas. |
| `fn_paciente_catalogo()` | Paso 1-2: servicios con sus profesionales. |
| `fn_paciente_calendario(profesional, servicio)` | Paso 3: 31 días (hoy + 30) con libres por día. |
| `fn_paciente_horarios(profesional, servicio, fecha)` | Paso 3: horarios libres del día (sin pasado ni más de 30 días). |
| `fn_paciente_sacar_turno(profesional, servicio, fecha, hora, obra_social)` | Paso 4: confirma. |
| `fn_paciente_mis_turnos()` | Próximos y anteriores. |
| `fn_paciente_cancelar_turno(turno)` | Cancelar un turno propio. |

La disponibilidad reutiliza `fn_horarios_del_dia` (HU-25/HU-33), así que el portal y Recepción ven exactamente los mismos horarios.

## Front

- `src/app/(portal)/portal/ingresar` — página + `ingresarPaciente` / `salirPortal`.
- `src/app/(portal)/portal/(privado)` — layout con barra propia (Mis turnos · Sacar turno · Salir), `/portal` y `/portal/nuevo`.
- `src/lib/portal/` — `acceso.ts` (`obtenerPacientePortal`, `exigirPaciente`, `exigirPacienteAccion`), `actions.ts`, `validar.ts` (lógica pura), `tipos.ts`.
- `src/components/portal/` — `SacarTurnoForm`, `CancelarTurnoPortalForm`. Reutiliza `CalendarioDias` y `EstadoTurnoBadge`.
- `src/lib/supabase/middleware.ts` — `/portal/*` sin sesión va a `/portal/ingresar`; el resto del proxy no cambió.

Sin `supabase.from`. Las rutas `/portal/*` no están en la matriz de HU-08 (ningún rol de gestión entra) y sus actions usan `exigirPacienteAccion` en lugar de `exigirAccion`.

## Pruebas

- `npm test` — `tests/hu23-turno-online.test.mjs` (pasos, URL, validación, cobertura, que las páginas exijan paciente, que no haya `.from(` ni `p_id_paciente`) + `tests/hu08-acceso.test.mjs` ahora exige `exigirPacienteAccion` en `src/lib/portal/actions.ts`.
- `supabase/tests/hu23_turno_online.sql` (con rollback): ingreso por mail, catálogo, calendario de 31 días, ventana y pasado, cobertura ajena, sacar turno (online / normal / Particular), doble reserva, mis turnos sin turnos ajenos, cancelar ajeno / pasado / propio / dos veces, el horario se libera, ficha inactiva, Mesa de Entradas rechazada en el portal pero ve el turno, helpers internos sin `execute`.

## Fuera de alcance / a confirmar con el PO

- Registro de la cuenta del paciente y recuperación de contraseña.
- Reprogramar desde el portal (hoy: cancelar y sacar otro).
- Anticipación mínima para sacar o cancelar online (hoy: las mismas reglas que Recepción) y tope de turnos futuros por paciente.
- Mostrar el origen "Online" en las pantallas de Recepción (la columna ya existe; mostrarla requiere recrear `fn_obtener_turno` / `fn_buscar_turnos`).
- Avisos por mail.
