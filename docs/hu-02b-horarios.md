# HU-02B — Franjas horarias del profesional

Rama: feature/hu-02b-horarios.

## Implementación
- Profesionales → Horarios: formulario de día, inicio y fin, y lista ordenada de franjas.
- Mensaje explícito cuando no hay horarios configurados.
- Varias franjas en un día y franjas contiguas permitidas.
- Validación de Gerente activo, profesional existente, servicio asociado y horarios válidos en las funciones SQL.
- Restricción EXCLUDE en PostgreSQL: impide duplicados y superposiciones, incluso ante inserciones concurrentes.
- RLS habilitado y sin acceso directo a la nueva tabla desde anon/authenticated.
- Días ISO: lunes = 1, domingo = 7. Horarios semanales locales, precisión de minutos.
- Editar/eliminar franjas y cálculo de turnos corresponden a HU-03 y HU-05.

## Migración
Archivo: supabase/migrations/002_hu02b_franjas_profesional.sql.
Depende de las tablas usuario, profesional, servicio y servicio_profesional de HU-02A.
Aplicada mediante SQL Editor al proyecto dbfehkykxsqgpctskuuq el 22/09/2026, con autorización.
No volver a ejecutar sobre ese proyecto: la migración crea objetos nuevos, no es idempotente.
El SQL Editor no registra automáticamente esta ejecución en supabase_migrations.schema_migrations.
Si el equipo adopta Supabase CLI, deberá reconciliar el historial antes de ejecutar db push.

## Verificación realizada
- npm run build: correcto, incluida la ruta /profesionales/[id]/horarios.
- node --test tests/horarios.test.mjs: 4 pruebas aprobadas (requiere Node 22.18+ o 24).
- supabase/tests/hu02b_horarios.sql: ejecutado en Supabase, resultado correcto.
  Comprueba consulta vacía, servicio obligatorio, mañana/tarde, franjas contiguas,
  días distintos, orden, habilitación, hora final igual/anterior, cruces parciales,
  duplicados, inclusión de intervalos, días inválidos, horario nulo,
  profesional inexistente y rechazo de usuario Profesional/no autenticado.
  Verifica permisos de tabla y RPC. Todos los datos ficticios se revierten.
- No hay llamadas .from( en src.
- La compilación advierte un package-lock.json adicional en la carpeta superior; no impidió compilar.
- Concurrencia protegida por EXCLUDE; no se ejecutó una prueba con dos sesiones simultáneas.

## Comprobación visual pendiente
Con el servidor local en ejecución, iniciar sesión como Gerente y abrir Profesionales → Horarios.
En un profesional de prueba con servicio:
1. Confirmar “No tiene horarios configurados”.
2. Agregar lunes 09:00–12:00 y 16:00–19:00; recargar y comprobar persistencia.
3. Intentar lunes 11:00–14:00; debe mostrar el rechazo y conservar las franjas anteriores.
4. Intentar fin igual/anterior al inicio; debe mostrar el rechazo.
5. Probar una pantalla angosta y navegación de teclado.

## Entrega pendiente
Cambios guardados localmente; falta commit/push y PR revisado.
origin/develop solo contenía el commit inicial al consultar el remoto; incorporar primero
la base de HU-02A o acordar con el equipo la rama base para evitar un PR con todo el proyecto.
No se considera terminada hasta la revisión y la integración en develop.

