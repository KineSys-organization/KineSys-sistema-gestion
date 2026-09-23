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
| 2. Horario ocupado entre consulta y confirmación → rechazo | SQL (segundo otorgamiento + insert superpuesto contra `EXCLUDE`) + manual con dos pestañas |
| 3. Estado "Confirmado" | SQL (`fn_obtener_turno`) + resumen |
| 4. Sin fechas pasadas | SQL (ayer / hoy 00:00) + unit |
| 5. Resumen con paciente, profesional, día y hora | SQL (campos devueltos) + `/turnos/[id]` |
| 6. Varias obras → elegir una o Particular | SQL (obra elegida, Particular, obra ajena) + unit (`coberturaInicial`) |

- `supabase/tests/hu06_turnos.sql`: correr en el SQL editor. Simula una sesión de Mesa de Entradas y hace `rollback` al final.
- `node --test tests/turnos.test.mjs`

## Migración

`supabase/migrations/005_hu06_otorgar_turno.sql`
