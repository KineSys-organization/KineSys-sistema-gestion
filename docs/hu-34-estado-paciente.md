# HU-34 — Activar o desactivar un paciente

La migración `hu34_estado_paciente` ya está aplicada en Supabase. El paciente nunca se borra y el cambio de estado no toca turnos, pagos ni atenciones.

| RPC | Uso |
|---|---|
| `fn_cambiar_estado_paciente` | Activa/desactiva por `p_id_paciente` y `p_activo`; solo Gerente o Mesa de Entradas mediante `fn_es_recepcion`. |
| `fn_filtrar_pacientes` | Suma `p_estado`: `activos` (por defecto), `inactivos` o `todos`, combinable con texto, obra social y edad. |
| `fn_obtener_paciente` | Devuelve el estado y los turnos confirmados futuros con fecha, hora, profesional y servicio. |

La ficha `/pacientes/[id]` muestra el estado y requiere confirmación. Antes de desactivar, lista los turnos futuros y aclara que se conservan. El listado `/pacientes` abre en Activos; los estados se distinguen con badges verde y rojo pastel. El paso 1 de Otorgar turno sigue usando la búsqueda de pacientes activos; la base también rechaza nuevos y repetidos para pacientes inactivos.

## Verificación

- `supabase/tests/hu34_estado_paciente.sql`: prueba con y sin turnos futuros, conservación del turno, rechazo de otorgar/repetir, filtros, reactivación y bloqueo del Profesional. Usa `ROLLBACK`.
- `npm test`.
