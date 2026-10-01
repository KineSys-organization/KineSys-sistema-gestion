# HU-30 — Editar, rol y estado de usuarios de gestión

Las funciones ya están en Supabase (`gestion_usuarios_gestion_editar_rol_estado`). El front solo las llama.

| RPC | Parámetros |
|---|---|
| `fn_obtener_usuario_gestion` | `p_id_usuario` |
| `fn_editar_usuario_gestion` | `p_id_usuario`, `p_nombre`, `p_apellido`, `p_telefono` |
| `fn_cambiar_rol_usuario_gestion` | `p_id_usuario`, `p_rol` |
| `fn_cambiar_estado_usuario_gestion` | `p_id_usuario`, `p_activo` (true/false, no es toggle) |

Pantallas: `/usuarios` (listado, cabecera + tabla como profesionales), `/usuarios/nuevo` (alta HU-29) y `/usuarios/[id]/editar`. Solo Gerente. Si el Gerente se baja a Mesa o se desactiva (con otro Gerente activo), se cierra la sesión.
