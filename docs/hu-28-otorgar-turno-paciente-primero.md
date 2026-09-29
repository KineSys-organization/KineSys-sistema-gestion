# HU-28 — Otorgar turno empezando por el paciente

**Como** Recepción, **quiero** que al otorgar un turno se identifique primero al paciente,
**para** no elegir hueco a ciegas y poder seguir con una serie (HU-25) desde esa persona.

Prioridad: Media · Story points: 2 · Incremento 2 (corrección del sprint 1) · Módulo: Turnos.

## Qué cambia

Reemplaza el orden de HU-06 que se entregó en el Incremento 1 (horario → paciente → confirmar).

| Paso | Pantalla | Qué se hace |
|---|---|---|
| 1. Paciente | `/turnos/nuevo` | Buscar (`fn_buscar_pacientes`, HU-04) o registrar con `?volver=` |
| 2. Servicio y profesional | `/disponibilidad?paciente=` | Paciente a la vista con "Cambiar" + selector |
| 3. Fecha y horario | `/disponibilidad?paciente&profesional&servicio&fecha` | Calendario de 30 días y horarios libres (HU-05) |
| 4. Cobertura | `/turnos/nuevo?paciente&profesional&servicio&fecha&hora` | Obras del paciente o Particular |
| 5. Confirmar | (misma pantalla) | `fn_otorgar_turno` revalida con lock |

- **Sin paciente no se avanza:** `/disponibilidad` sin `?paciente` redirige al paso 1.
- **Accesos:** el menú "Otorgar turno", la tarjeta de Inicio y el botón de la Agenda abren el paso 1. La Agenda conserva profesional y día.
- **Volver sin perder datos:**
  - "Cambiar paciente" vuelve al paso 1 conservando profesional, servicio y fecha.
  - "Cambiar horario" y "Elegir otro horario" vuelven al calendario con el paciente.
- **Alta de paciente a mitad del flujo:** vuelve con el paciente ya elegido y sigue al paso 2. Se corrigió el armado de la URL, que antes se rompía si el paso 1 no tenía parámetros.
- **Resumen del turno (`/turnos/[id]`):** tiene "Otro turno para este paciente", que va a los pasos 2 y 3 con el mismo paciente, profesional y servicio, y "Otorgar turno a otro paciente". Es la base para HU-25.

## Qué no cambia (reglas de negocio)

- No hay migración. `fn_otorgar_turno`, `fn_consultar_disponibilidad` y `fn_consultar_disponibilidad_calendario` quedan igual.
- Siguen las mismas reglas:
  - Profesional activo con el servicio.
  - No se dan turnos en el pasado.
  - Ventana de 30 días.
  - Al confirmar se revalida con lock, con el mensaje *El horario seleccionado ya no está disponible*.
- Estados del turno y cobertura: igual que HU-06.
- Permisos: Gerente y Mesa de Entradas (`exigirRecepcion` en ambas páginas, sin cambios en la matriz HU-08).

## Archivos

- `src/lib/turnos/flujo.ts`: pasos y URLs del flujo (lógica pura, testeada).
- `src/app/(main)/turnos/nuevo/page.tsx`: paso 1 y pasos 4-5.
- `src/app/(main)/disponibilidad/page.tsx`: pasos 2-3 con el paciente.
- `src/components/turnos/PasosTurno.tsx`: 5 pasos.
- `src/components/disponibilidad/SelectorProfesionalServicio.tsx` y `src/components/turnos/OtorgarTurnoForm.tsx`: conservan al paciente.
- `src/components/Navegacion.tsx`, `src/app/(main)/page.tsx`, `src/app/(main)/agenda/page.tsx` y `src/app/(main)/turnos/[id]/page.tsx`: accesos al paso 1.
- `src/lib/pacientes/validar.ts` y `src/lib/pacientes/actions.ts`: regreso del alta (`urlVolverConPaciente`).
- Se eliminó `urlDisponibilidad` (armaba URLs sin paciente).

## Pruebas automáticas

- `tests/hu28-flujo-turno.test.mjs`:
  - Orden de pasos.
  - URLs de cada paso (el paciente nunca se pierde).
  - Regreso del alta con y sin parámetros.
  - El menú y el Inicio abren el paso 1.
  - `/disponibilidad` sin paciente redirige.
  - `/turnos/nuevo` pide el paciente antes que el horario.
  - Ningún link usa la URL vieja.
- `tests/mejoras-ux.test.mjs`: actualizado (`/turnos/nuevo` sin parámetros es un regreso válido).
- `npm test`: 87/87 · `tsc --noEmit`: 0 errores · `next build`: OK · `grep ".from(" src/`: 0.

## Prueba en el navegador (Mesa de Entradas)

- [ ] Menú "Otorgar turno" abre la búsqueda de paciente (paso 1).
- [ ] Buscar paciente → Elegir → aparece el paciente arriba y el calendario (pasos 2-3).
- [ ] Cambiar profesional o servicio: el paciente sigue elegido.
- [ ] Elegir día y horario → cobertura → Confirmar → resumen del turno.
- [ ] En el resumen, "Otro turno para este paciente" vuelve al calendario con el mismo paciente.
- [ ] Paciente nuevo: "Registrar paciente nuevo" → alta → vuelve al paso 2 con ese paciente.
- [ ] Entrar directo a `/disponibilidad` sin paciente → redirige al paso 1.
- [ ] Desde la Agenda, "Otorgar turno" → paso 1 → al elegir paciente, el calendario abre con ese profesional y ese día.
- [ ] Horario ocupado entre medio → *El horario seleccionado ya no está disponible* → "Elegir otro horario" mantiene al paciente.
- [ ] Como Profesional: `/turnos/nuevo` y `/disponibilidad` → vuelve a Inicio con el aviso de sin permiso.
