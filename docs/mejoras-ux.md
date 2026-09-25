# Mejoras de UX/UI (25/09/2026)

Rama: `feature/mejoras-ux`. Revisión de toda la app con la rúbrica de *design-review*, *better-accessibility* y *refactoring-ui*, recorriendo las pantallas como Mesa de Entradas y Profesional. Tres fases: navegación y otorgar turno (1), filtros de pacientes (2) y calendario de disponibilidad (3). **No se agregó sexo del paciente** (decisión: no cambiar el modelo de datos).

## Qué cambió, pantalla por pantalla

### Menú superior (todas las pantallas)
- Sin subrayado; la sección activa se resalta y se anuncia (`aria-current="page"`).
- Orden por uso diario: Inicio · **Otorgar turno** · Agenda · (Mi agenda) · Pacientes · Profesionales · Servicios.
- Un solo renglón. En pantallas angostas se desliza de costado (sin barra visible) y se centra solo en la sección activa.
- Foco visible con teclado (verde claro sobre la barra oscura).

### Inicio
- Recepción: la primera tarjeta es **Otorgar turno** (sin resaltar: todas las tarjetas se ven iguales y solo cambian al pasar el mouse).
- Profesional: **resumen del día** — "Hoy tenés N turnos · M por atender · Próximo: 10:00 Apellido" con botón **Atender al próximo**.

### Otorgar turno (antes "Disponibilidad")
- Indicador de pasos: **1 Horario → 2 Paciente → 3 Confirmar** (los hechos con ✓).
- Paso 1 con **calendario de los próximos 30 días**: profesional y servicio (se recalcula al cambiar, sin botón "Consultar"); cada día muestra cuántos horarios libres tiene; los días sin lugar se ven apagados. Se abre solo en el primer día con lugar y muestra sus horarios como **botones grandes** (44px).
- Arranca con el primer profesional que tenga lugar (no con un calendario vacío).
- Todo queda en la URL: **"Cambiar horario"** y "Elegir otro horario" vuelven con profesional, servicio y día ya elegidos.
- Paso 2: el foco va directo al buscador. Si el paciente no existe, **"Registrar paciente nuevo"** y al guardarlo se **vuelve al turno con el paciente elegido** (solo se acepta volver a `/turnos/nuevo`, no a otra dirección).

### Turno otorgado (`/turnos/[id]`)
- Antes: "Cancelar turno" (31px, letra 13px) quedaba **pegado arriba** de "Otorgar otro turno" (45px, letra 16px), superpuestos 1px.
- Ahora: una fila al pie con **Otorgar otro turno** (principal) · **Ver agenda del día** (secundario) y **Cancelar turno** aparte, a la derecha, en rojo suave. Todos de 44px, letra 16px, 12px de separación. El formulario de cancelación se abre debajo, a todo el ancho.

### Agenda (Recepción)
- Abre directo en **hoy** con el primer profesional; profesional y fecha en la URL (se puede linkear desde el turno).
- "Día anterior / Hoy / Día siguiente" y botón **Otorgar turno** para ese profesional y día.
- Los cancelados muestran el **motivo como texto**, no solo el color.

### Pacientes
- El listado aparece **apenas se entra** (antes había que escribir algo).
- **Filtros**: texto (DNI o nombre), **obra social** (o *Particular*) y **rango etario** (0–17, 18–39, 40–64, 65+). Se combinan, quedan en la URL y hay botón **Limpiar**. Columna **Edad**. Contador de resultados.

### Mi agenda y atención (Profesional)
- El **próximo turno a atender** se resalta con la etiqueta "Próximo".
- En la ficha, después de registrar la atención: botón **Siguiente paciente: 10:30 · Apellido →** para seguir la jornada sin volver a la lista.
- Mismo badge de estado que la agenda de Recepción (con el motivo en los cancelados).

### Accesibilidad y consistencia (global)
- `<main>` en las pantallas internas; `role="alert"` en todos los mensajes de error (se anuncian).
- Botones con tres niveles (principal, secundario, riesgo) y el mismo alto (44px).
- Contrastes: badge "Inactivo" 4,1:1 → 5,4:1; hover de botones azules en azul oscuro (el celeste con texto blanco daba 3,7:1).
- Las tablas scrollean dentro de su tarjeta en pantallas angostas.

## Base de datos — `supabase/migrations/011_mejoras_pacientes_calendario.sql`
Aplicada el 25/09/2026 como `mejoras_pacientes_calendario`. **Solo agrega dos funciones**; no cambia tablas ni reemplaza funciones existentes.

- `fn_filtrar_pacientes(texto, obra, edad_min, edad_max)`: Recepción (`fn_es_recepcion`). Todos los filtros opcionales; `obra` = `null` (todas), `'particular'` o el id de la obra. Devuelve la edad calculada (hora de Argentina). Máximo 100 filas. `fn_buscar_pacientes` sigue igual (la usa el paso 2 de otorgar).
- `fn_consultar_disponibilidad_calendario(profesional, servicio)`: Recepción. Libres por día de hoy a hoy + 30, reutilizando `fn_consultar_disponibilidad` (franjas, duración, ocupados y horarios pasados). ~60 ms.
- Ambas `security definer`, `search_path = ''`, `execute` para `authenticated`, no para `anon`.

## Archivos
- Nuevos: `src/lib/disponibilidad/calendario.ts`, `src/components/disponibilidad/SelectorProfesionalServicio.tsx`, `src/components/turnos/PasosTurno.tsx`, `src/components/turnos/EstadoTurnoBadge.tsx`, `supabase/migrations/011_mejoras_pacientes_calendario.sql`, `tests/mejoras-ux.test.mjs`.
- Reescritos: `/disponibilidad`, `/agenda`, `/pacientes`, `/turnos/nuevo`, Inicio, `Navegacion`.
- Ajustados: `/turnos/[id]`, `CancelarTurnoForm`, `OtorgarTurnoForm`, `/pacientes/nuevo` + `AltaPacienteForm`, `/mi-agenda` y `/mi-agenda/[id]`, `(main)/layout`, actions de agenda, disponibilidad y pacientes, `globals.css`.
- Eliminados (quedaron sin uso): `DisponibilidadForm.tsx`, `AgendaForm.tsx`.

## Pruebas
- `npm test`: 57/57 (6 nuevas: calendario, "volver" seguro, filtros, migración 011).
- `tsc --noEmit` OK · `npm run build` OK sin warnings · `.from(` en `src/`: 0.
- SQL (en transacción con rollback, antes de aplicar): filtros por texto, particular, obra y edad; obra inválida y rango invertido rechazados; calendario de 31 días en 59 ms; un Profesional no puede usar ninguna de las dos funciones.
- Navegador como Mesa de Entradas: menú; Otorgar turno completo hasta el paso 3 (sin confirmar, para no crear datos); "Cambiar horario" conserva lo elegido; resumen del turno con botones alineados; formulario de cancelación (sin confirmar); "Ver agenda del día"; filtros de pacientes combinados, vacío y URL manipulada.

## Relación con issues abiertas (revisado el 25/09/2026)
Ninguna issue abierta queda completa ni en conflicto con estos cambios.
- **HU-15 (#15, dashboard del profesional):** el resumen del día en el Inicio del Profesional (turnos de hoy, por atender, próximo) es una **base**; HU-15 le suma atendidos, cancelaciones/ausencias de la semana y los contadores en cero.
- **HU-11 (#11):** la agenda diaria ya tiene navegación por días; la **vista semanal sigue pendiente**.
- **HU-09 (#9):** los filtros nuevos son de **pacientes**; filtrar **turnos** sigue pendiente (puede reutilizar el patrón de filtros en la URL).
- **HU-10B, HU-14, HU-25:** sus acciones (reprogramar, ausente, pago, repetir) entran en la fila `acciones-pie` del resumen del turno. Aviso previo a estos cambios: HU-25 pide hasta 24 semanas y HU-05 limita la disponibilidad a 30 días.
- **HU-16, HU-20, HU-24, HU-18, HU-23:** tocan las mismas pantallas sin superponerse.
