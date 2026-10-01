# HU-32 — Editar y activar/desactivar obras sociales

Las funciones ya están en Supabase (`obras_sociales_editar_y_estado`). El front solo las llama.

| RPC | Parámetros |
|---|---|
| `fn_editar_obra_social` | `p_id_obra_social`, `p_nombre` |
| `fn_cambiar_estado_obra_social` | `p_id_obra_social`, `p_activo` (true/false, no es toggle) |

Pantalla: `/obras-sociales` (la de HU-31). Solo Gerente (`catalogo.gestionar`).

- El listado de gestión muestra activas e inactivas.
- Editar nombre: 2 a 80 caracteres; duplicado → mensaje de la base.
- Desactivar pide confirmación y **no borra** la fila ni toca pacientes/turnos.
- En la ficha del paciente, una obra inactiva se ve como "(inactiva)" y se reenvía al guardar si no se quita.
- Al otorgar un turno, solo se ofrecen las obras activas del paciente, más Particular.
