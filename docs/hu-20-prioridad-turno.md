# HU-20 — Prioridad o urgencia del turno (#20)

## Qué hace

- Tres valores: **Normal** (por defecto), **Alta** y **Urgente**.
- Al otorgar (HU-06 / HU-28, paso Confirmar) hay un desplegable **Prioridad**; si no se toca,
  queda Normal.
- En `/turnos/[id]` se ve siempre la prioridad (y la nota, si hay). Con **Cambiar prioridad**
  Recepción o Gerente la cambian, con nota opcional ≤ 200, solo si el turno está Confirmado
  y todavía no empezó (`prioridad_editable`, lo calcula la base). En cancelados, atendidos,
  ausentes o pasados se ve pero no se edita.
- Marca `PrioridadBadge` (texto "Prioridad Alta/Urgente" + símbolo + color; Normal sin marca) en
  `/agenda` (día y semana), `/turnos`, `/turnos/[id]`, `/mi-agenda` y `/mi-agenda/[id]`.
- `/turnos` suma el filtro **Prioridad** (Todas / Normal / Alta / Urgente), en la URL y
  combinable con los demás.
- No cambia el orden por horario, la disponibilidad ni habilita sobreturnos.
- Reprogramar conserva la prioridad (solo cambia fecha y horas). Repetir (HU-25) copia la
  prioridad y la nota del original; después cada turno es independiente.

## Base de datos (`supabase/migrations/027_hu20_prioridad_turno.sql`)

- `turno.prioridad text not null default 'normal'` + `check`, `prioridad_nota` (≤ 200),
  `prioridad_actualizada_en/por`. Los turnos existentes quedan en Normal.
- `fn_otorgar_turno(..., p_prioridad default 'normal')` y `fn_buscar_turnos(..., p_prioridad)`
  con **drop + create**.
- `fn_cambiar_prioridad_turno(turno, prioridad, nota)`: `fn_exigir_rol(['Gerente','Mesa de
  Entradas'])`, lock de la fila, confirmado y no empezado (hora de Argentina).
- `fn_obtener_turno`, `fn_consultar_agenda_profesional` y `fn_turno_repetir_confirmar`
  recreadas sumando la prioridad (copias de 025, 014 y 018).
- Acción nueva `turnos.prioridad` (Gerente + Mesa de Entradas).

## Pruebas

- SQL con rollback: `supabase/tests/hu20_prioridad_turno.sql`.
- `npm test`: `tests/hu20-prioridad-turno.test.mjs` (+ `hu09` y `hu08` actualizados).
