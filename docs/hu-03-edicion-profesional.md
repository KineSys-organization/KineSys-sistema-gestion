# HU-03 — Editar profesional y gestionar activo/inactivo

Issue: #3. Rama: `feature/hu-03-editar-profesional`. Base de integración actual del repositorio: `main`, donde ya está HU-06 (#34).

## Comportamiento

- Solo Gerente puede editar datos, activar/desactivar y modificar/eliminar franjas. Las RPC verifican rol y estado, incluso si se invocan sin la pantalla.
- Al abrir Editar se precargan nombre, apellido, nacimiento, DNI, teléfono y matrícula actuales. El mail de la cuenta seleccionada se muestra de solo lectura. La RPC consulta `auth.users` exclusivamente del profesional solicitado, con respaldo en `usuario.mail_usuario`.
- Los servicios guardados aparecen marcados; también se muestran los inactivos que ya estaban asociados para no quitarlos inadvertidamente. Cada casilla y su nombre forman una opción visual. Si la operación falla, se conserva lo ingresado.
- Según lo acordado con el usuario: quitar servicios se bloquea si el profesional tiene turnos confirmados pendientes (incluidos en curso). Sin esos turnos, requiere aceptar una advertencia. Se permite quedar sin servicios con aviso explícito; el alta conserva su validación original de mínimo un servicio.
- Activar/desactivar conserva datos, servicios, franjas y todos los turnos. Al desactivar deja de ofrecerse disponibilidad nueva; al reactivar se reutiliza su configuración.
- Agregar/editar franjas mantiene las reglas de HU-02B: días 1–7, horarios sin segundos, fin posterior al inicio, servicios asociados y no superposición.
- Editar o eliminar una franja **sí se permite cuando hay turnos afectados**. No se modifica ni cancela ningún turno. Se muestra el impacto antes de confirmar y el resultado después de guardar, con paciente, DNI, fecha, inicio/fin, servicio y enlace al turno. Recepción gestiona manualmente con HU-10A/HU-10B; no se agregó una notificación automática.
- El aviso incluye turnos confirmados pendientes/en curso que estaban cubiertos y quedan total o parcialmente fuera del nuevo horario; excluye históricos, cancelados, ausentes y los que siguen cubiertos. No limita el aviso a los 30 días de consulta de disponibilidad.
- El listado se recalcula al guardar. Una reserva llegada después de la vista previa aparece en el resultado definitivo. Los cambios y `fn_otorgar_turno` comparten un bloqueo por profesional para evitar confirmar contra la agenda previa durante una edición concurrente.

## Migración y despliegue

Aplicar `supabase/migrations/006_hu03_editar_profesional.sql` después de 001–005 y antes de usar las nuevas pantallas. La numeración 006 evita colisionar con 003 de HU-04.

La migración crea/actualiza las funciones de HU-03 y actualiza `fn_otorgar_turno` para compartir el bloqueo. No escribe sobre turnos existentes. El frontend usa Auth/RPC, sin consultas directas a tablas.

**Entorno compartido:** migración 006 corregida aplicada el 23/09/2026 con autorización del usuario, después de ejecutar la migración y las pruebas dentro de una transacción con ROLLBACK. Se compararon cantidad y huella de todas las filas de usuario, profesional, paciente, servicio, servicio_profesional, franja_profesional y turno antes/después: idénticas.

## Verificación realizada

- `npm test`: **23/23 aprobadas**, incluyendo renderizado del formulario precargado, selección persistida, servicios inactivos asociados y aviso de turnos conservados.
- `npm run build`: aprobado sobre copia aislada del mismo código, para evitar que el servidor de desarrollo y el build compitan por `.next`.
- `supabase/tests/hu03_edicion_profesional.sql`: aprobado en PostgreSQL local mediante PGlite con `btree_gist`, migraciones 001–006 reales y un esquema base de prueba que representa HU-01/02A. Incluye edición, confirmación de servicios, mail, estados, disponibilidad, turnos idénticos antes/después, límites parciales, cambio de día, múltiples semanas, eliminación y permisos. Esto no reemplaza la validación del esquema remoto existente.
- El script SQL crea sus propios datos y finaliza con `ROLLBACK`. Para repetir en Supabase requiere las migraciones y un Gerente activo.
- Ninguna llamada `.from(` en `src/`.

## Comprobación en la aplicación

1. Aplicar 006, iniciar sesión como Gerente y abrir un profesional desde Editar.
2. Comparar los datos con los actuales; verificar mail de solo lectura y casillas de servicios marcadas. Guardar y reabrir: deben reflejar la última actualización.
3. Con turnos futuros, reducir una franja para dejar un turno parcialmente afuera. Revisar el aviso, confirmar y verificar el listado posterior y el turno intacto.
4. Repetir eliminando una franja. Verificar que disponibilidad use la nueva agenda y los turnos sigan confirmados.
5. Desactivar/reactivar: sin disponibilidad nueva al desactivar, con la configuración previa al reactivar y turnos sin cambios.
6. Quitar servicios: con reservas pendientes se rechaza; sin reservas se pide confirmación, incluido dejarlo sin servicios.

La HU se considera cerrada después de la revisión del PR e integración en la rama acordada por el equipo. La issue menciona `develop`; el repositorio actualmente integra las dependencias y solicita PR a `main` en `AGENTS.md`.

## Compatibilidad con funciones previamente instaladas

Se corrigió el error 42P13 observado en Supabase: la función existente `fn_obtener_profesional(uuid)` devolvía TABLE y la nueva devuelve JSONB. La migración elimina únicamente esa firma (sin CASCADE) y la recrea con sus permisos dentro de la misma transacción. La prueba local de actualización desde RETURNS TABLE y la segunda ejecución de 006 pasan junto con las pruebas SQL de HU-03.

Se inspeccionó el esquema real mediante consultas de solo lectura: la función anterior seguía instalada, las nuevas RPC de HU-03 no estaban presentes y las tablas respondían. Después de esa inspección se aplicó la corrección con autorización explícita.

## Verificación final en Supabase y servidor local

- Pruebas SQL ejecutadas contra el esquema real: aprobadas con ROLLBACK. Se ajustó el mail ficticio del fixture para cumplir la restricción real de usuario.
- Aplicación definitiva: resultado «HU03 aplicada: datos existentes idénticos antes y después».
- RPC del profesional que el usuario estaba editando: mail y nacimiento presentes; dos servicios asociados, Evaluación inicial y Kinesiología general.
- Servidor Next.js reiniciado con caché .next regenerada, conservando la anterior fuera del repositorio. Login e inicio volvieron a responder HTTP 200.
