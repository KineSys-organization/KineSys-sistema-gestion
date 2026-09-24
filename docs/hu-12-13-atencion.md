# HU-12 / HU-13 — Mi agenda y registrar la atención

Rama: `feature/hu-12-13-atencion`. Issues: #12 y #13. Dependen de HU-06 (turnos), HU-07 (agenda) y HU-08 (acceso). Modifican HU-05, HU-07 y HU-10A (estado `atendido`).

> **HU-12.** Como Profesional quiero ver únicamente mi propia agenda y mis pacientes del día, para organizar mi jornada sin depender de Recepción.
>
> **HU-13.** Como Profesional quiero registrar que atendí un turno, dejando fecha y observaciones, para que el turno represente una atención real y se pueda consultar después como historial.

## Criterios de aceptación

| HU | # | Criterio | Estado |
|---|---|---|---|
| 12 | 1 | Profesional logueado consulta su agenda → ve solo sus turnos | ✅ |
| 12 | 2 | Abre un turno del día → ve el paciente asociado | ✅ |
| 12 | 3 | Intenta ver agenda/pacientes de otro profesional → se impide | ✅ |
| 13 | 1 | Turno confirmado del día + observaciones → pasa a Atendido con fecha, profesional y observaciones | ✅ |
| 13 | 2 | Turno ya atendido → registrar de nuevo se impide; solo edición explícita | ✅ |
| 13 | 3 | (Should) Motivo/tipo de consulta queda guardado con la observación | ✅ |

## Flujo

1. Login como Profesional (HU-08). El menú muestra **Mi agenda**.
2. `/mi-agenda`: hoy por defecto (hora de Argentina), con "Día anterior / Hoy / Día siguiente" y selector de fecha (`?fecha=`). Tabla con horario, paciente, DNI, servicio y estado. Los confirmados del día tienen **Atender**; el resto, **Ver turno**.
3. `/mi-agenda/[id]`: datos del paciente (nombre, DNI, edad, teléfono, cobertura, servicio).
   - Confirmado del día → formulario **Registrar atención** (motivo opcional ≤ 200, observaciones obligatorias ≤ 2000) → **Confirmar atención**.
   - Atendido → la atención registrada + botón **Editar atención** (edición explícita).
   - Confirmado de otro día → aviso, sin formulario. Cancelado → aviso.
4. `registrarAtencion` / `editarAtencion` (server actions) → `exigirAccion("atencion.registrar")` → `validarAtencion` → RPC → `revalidatePath` de `/mi-agenda`, `/agenda` y `/turnos/[id]` → redirect con mensaje de éxito. Si la RPC falla se muestra su `error.message` y lo escrito no se pierde.

## Seguridad (3 capas, como HU-08)

1. **Página:** `exigirProfesional()` (Gerente y Mesa → Inicio con aviso).
2. **Server action:** `exigirAccion("atencion.agenda" | "atencion.registrar")`. El id del profesional sale de la sesión, nunca del request.
3. **Base (la que manda):** `auth.uid()` tiene que ser el profesional del turno o de la agenda. `turno` y `atencion` con RLS y sin grants a `authenticated`: no se pueden leer ni escribir directo por la API.

## Backend — `supabase/migrations/010_hu12_hu13_atencion.sql`

- `turno_estado_valido`: `confirmado | cancelado | ausente | atendido`.
- `turno_sin_superposicion`: ahora sobre `confirmado` y `atendido` (un atendido ocupó su horario).
- Tabla `atencion`: `id_turno` (unique), `id_profesional`, `id_paciente`, `fecha_atencion`, `observaciones` (1..2000), `motivo_consulta` (≤ 200), `registrado_en`, `editado_en`. RLS + `revoke all`.
- `fn_exigir_turno_propio(uuid)` (interna, revocada a `authenticated`): Profesional activo y dueño del turno.
- `fn_registrar_atencion(turno, observaciones, motivo)`: turno propio, observaciones obligatorias, `for update` del turno, estado `confirmado` y fecha de hoy (Argentina), inserta la atención copiando profesional y paciente del turno, pasa el turno a `atendido`. Errores: ya registrada (también por `unique_violation`), cancelado, ausente, no es del día.
- `fn_editar_atencion(turno, observaciones, motivo)`: solo el profesional que atendió; actualiza observaciones y motivo y marca `editado_en`.
- `fn_consultar_agenda_profesional`: Recepción igual; Profesional solo con `p_id_profesional = auth.uid()`. Devuelve también `atendido` y `atendible`.
- `fn_obtener_turno`: Recepción igual; Profesional solo sus turnos. Suma `fecha_nacimiento_paciente`, `telefono_paciente`, `atendible` y `atencion` (solo para el profesional que atendió).
- `fn_consultar_disponibilidad`: un turno `atendido` sigue ocupando el horario.
- `fn_cancelar_turno`: *El turno ya fue atendido; no se puede cancelar*.

## Pruebas

- **Unitarias:** `npm test` (`tests/hu12-hu13-atencion.test.mjs` + matriz HU-08 con `/mi-agenda` y las acciones nuevas).
- **SQL:** `supabase/tests/hu12_hu13_atencion.sql` en el SQL editor (con la 010 aplicada). Usa Mesa (carlaperez@), Paciente (juanrodriguez@), el primer Profesional activo con servicio y, como "otro profesional", el Gerente pasado a Profesional dentro de la transacción. Termina con `rollback`.

## Evidencia (24/09/2026)

**Migración** — `010_hu12_hu13_atencion.sql` aplicada en Supabase (`dbfehkykxsqgpctskuuq`) el 24/09/2026 como `hu12_hu13_atencion`. Antes se verificó que las funciones reales coincidían con 005/009 del repo, que no existía `atencion` y que los 3 turnos eran `confirmado`. Después: los cuerpos de las 7 funciones coinciden por hash con el archivo; `atencion` con RLS, 0 policies, sin `select` para `authenticated`/`anon`; RPC con `execute` para `authenticated` y no para `anon`.

**SQL** — `hu12_hu13_atencion.sql`: OK, rollback sin residuos. Regresión `hu10a_cancelar_turno.sql` sobre la base migrada: OK (ver nota). Cuentas reales: Agustín Juárez (Profesional) contra el turno de hoy de Lucía → agenda *Solo podés consultar tu propia agenda*; ver/registrar/editar *El turno no existe o no pertenece a tu agenda*; `select` directo a `turno`/`atencion` → `permission denied`.

**En la app** (luciafernandez@, Profesional):

1. Inicio muestra solo "Mi agenda". `/mi-agenda` → hoy, 2 turnos, "2 por atender".
2. **Atender** 19:00 → paciente TestHU06 (DNI, edad, teléfono, cobertura, servicio).
3. Observaciones con solo espacios → *Tenés que escribir las observaciones de la atención* (el motivo escrito se conserva).
4. Motivo "Control de rodilla" + observaciones en dos líneas → **Atendido**, "Atención registrada". En la base: 1 fila en `atencion` con fecha 24/09, profesional y paciente del turno, motivo y observaciones.
5. Volver a mi agenda → 19:00 **Atendido**, "1 por atender".
6. Mismo turno (19:30) abierto en dos pestañas: registrar en una y confirmar en la otra → *La atención de este turno ya fue registrada…*; en la base, una sola atención.
7. **Editar atención** (solo con el botón) → motivo cambiado, "Última edición".
8. URL con un id ajeno o inexistente → *El turno no existe o no pertenece a tu agenda*; id inválido → *Turno inválido*; `/agenda` y `/turnos/[id]` → Inicio con aviso de permisos; `?fecha=2026-02-30` → aviso y se muestra hoy.
9. Requests a mano con el token de Lucía contra la API de Supabase: agenda de otro profesional (400), `select`/`insert` directo en `turno`/`atencion` (403), `fn_exigir_turno_propio` (403), `fn_buscar_pacientes` (400), `fn_cancelar_turno` (400).
10. Sábado 26/09 → *No tenés turnos para este día.* Turno de mañana → *Vas a poder registrar la atención el día del turno.*, sin formulario.

**Nota:** `supabase/tests/hu04_pacientes.sql`, `hu06_turnos.sql` y `hu10a_cancelar_turno.sql` llaman a `fn_es_recepcion()` como `authenticated`, y la 008 (HU-08) les sacó ese permiso: fallan con `permission denied for function fn_es_recepcion` antes de probar nada. Es previo a esta HU; para la regresión se corrió HU-10A sin ese chequeo previo.
