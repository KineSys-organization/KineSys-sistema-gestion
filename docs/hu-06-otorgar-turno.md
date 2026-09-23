# HU-06 — Otorgar turno a un paciente

Rama: `feature/hu-06-otorgar-turno`. Issue: #6. Depende de HU-04 (pacientes) y HU-05 (disponibilidad).

## Flujo

1. `/disponibilidad`: Recepción consulta y hace clic en un horario libre.
2. `/turnos/nuevo`: se muestra el horario elegido, se busca al paciente (DNI o nombre) y se elige.
3. Se elige la cobertura: una obra social del paciente o **Particular**.
   - Una sola obra → preseleccionada (se puede cambiar a Particular).
   - Varias → Recepción tiene que elegir.
   - Ninguna → Particular.
4. **Confirmar turno** → `fn_otorgar_turno`.
5. `/turnos/[id]`: resumen (paciente, profesional, servicio, día, hora, cobertura) con estado **Confirmado**.

## Backend

- `fn_otorgar_turno(p_id_paciente, p_id_profesional, p_id_servicio, p_fecha, p_hora, p_id_obra_social)`:
  1. Permiso de recepción.
  2. Rechaza fecha/hora anterior a la actual (hora de Argentina).
  3. Paciente activo y obra social del paciente (o null = Particular).
  4. `pg_advisory_xact_lock` por profesional + día: las confirmaciones simultáneas se atienden de a una.
  5. **Revalida** el horario con `fn_consultar_disponibilidad` (HU-05). Si ya no figura → *El horario seleccionado ya no está disponible*.
  6. Inserta con estado `confirmado`. Si la restricción `EXCLUDE` detecta un solapamiento → mismo mensaje.
- `fn_obtener_turno(p_id_turno)`: detalle del turno para el resumen y para consultar su estado.
- Tabla `turno`: `id_obra_social`, `numero_afiliado`, estado `confirmado | cancelado | ausente`, restricción `turno_sin_superposicion`.

## Pruebas

| Criterio | Prueba |
|---|---|
| 1. Turno creado con paciente, obra, profesional, servicio, fecha y hora | SQL + unit (`validarOtorgarTurno`) |
| 2. Horario ocupado entre consulta y confirmación → rechazo | SQL (segundo otorgamiento + insert superpuesto contra `EXCLUDE`) + app (pantalla vieja y dos confirmaciones simultáneas) |
| 3. Estado "Confirmado" | SQL (`fn_obtener_turno`) + resumen |
| 4. Sin fechas pasadas | SQL (ayer / hoy 00:00) + unit |
| 5. Resumen con paciente, profesional, día y hora | SQL (campos devueltos) + `/turnos/[id]` |
| 6. Varias obras → elegir una o Particular | SQL (obra elegida, Particular, obra ajena) + unit (`coberturaInicial`) |

### Cómo correrlas

- **Unitarias:** `npm test` (usa `tsx --test`). Corre todos los `tests/*.test.mjs` y funciona en cualquier versión de Node: los tests importan archivos `.ts` y `tsx` los transpila.
  `node --test tests/turnos.test.mjs` solo anda en Node ≥ 22.18 (que carga `.ts` de forma nativa); en versiones anteriores falla con `ERR_UNKNOWN_FILE_EXTENSION: ".ts"`.
- **SQL:** pegar `supabase/tests/hu06_turnos.sql` en el SQL editor de Supabase. Simula la sesión de un usuario de Mesa de Entradas (`request.jwt.claims`), crea sus propios pacientes (DNI 99006101/99006102) y hace `rollback` al final. Si todo pasa muestra el aviso `HU-06 OK: C1 C2 C2-EXCLUDE C3 C4 C5 C6 ...`; si algo falla, corta con el criterio que falló.

## Evidencia (23/09/2026)

**Unitarias** — `npm test`, Node v24.15.0:

```
ℹ tests 16   (11 de HU-02B/04/05 + 5 de HU-06)
ℹ pass 16
ℹ fail 0
```

También con `NODE_OPTIONS=--no-experimental-strip-types npm test` (simula un Node sin soporte nativo de `.ts`, el caso del error de la revisión): 16/16.

**SQL** — `supabase/tests/hu06_turnos.sql` ejecutado sobre la base del proyecto (con el cierre en rollback, no dejó datos):

```
HU-06 OK: C1 C2 C2-EXCLUDE C3 C4 C5 C6 C6-particular C6-obra-ajena permisos
(fecha 2026-09-28, horas 18:00 y 18:30)
```

Cubre: turno creado con todos los datos (C1), segundo otorgamiento del mismo horario rechazado (C2), insert superpuesto rechazado por la restricción `turno_sin_superposicion` (C2), estado `confirmado` (C3), ayer y hoy 00:00 rechazados (C4), campos del resumen (C5), obra elegida guardada con su nº de afiliado, Particular guardado como `null` y obra ajena al paciente rechazada (C6), y un Profesional sin permiso para otorgar.

**En la app** (`npm run dev`, sesión Gerente, profesional Fernández, lunes 28/09):

| Caso | Resultado |
|---|---|
| Paciente con 2 obras | Ninguna preseleccionada, "Confirmar" deshabilitado hasta elegir |
| 17:00 con Galeno | Resumen "Confirmado", Galeno · nº B-2 |
| 17:30 con Particular | Resumen "Confirmado", Particular |
| Pantalla vieja: 17:00 confirmada en otra pestaña | "El horario seleccionado ya no está disponible", la cobertura elegida sigue marcada |
| **Dos confirmaciones simultáneas** de las 18:00 (dos pantallas, clic en el mismo instante) | Una → resumen (`POST 303`), la otra → "El horario seleccionado ya no está disponible" (`POST 200`). En la base quedó **un solo** turno a las 18:00 |
| URL con fecha pasada (21/09) | "No se puede consultar una fecha pasada" |
| Horario ya tomado abierto por URL | "El horario seleccionado ya no está disponible" |

## Migración

`supabase/migrations/005_hu06_otorgar_turno.sql`
