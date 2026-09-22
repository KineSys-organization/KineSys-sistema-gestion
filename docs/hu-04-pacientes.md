# HU-04 — Registrar, localizar y editar paciente

Rama: `feature/hu-04-pacientes`. Issue: #4.

## Implementación

- `/pacientes`: búsqueda por DNI o nombre/apellido.
- `/pacientes/nuevo`: alta con datos personales y obras sociales opcionales.
- `/pacientes/[id]`: edición de contacto y obras; DNI y fecha de nacimiento solo lectura.
- Roles: Gerente y Mesa de Entradas (`exigirRecepcion` + `fn_es_recepcion` en SQL).
- Particular no se asocia al paciente; sin obras = particular al momento del turno.
- Catálogo de obras sociales precargado en la migración; administración fuera de alcance.
- Front solo RPC; sin `supabase.from`.

## Migración

Archivo: `supabase/migrations/003_hu04_pacientes.sql`.

Crear tablas `obra_social`, `paciente`, `paciente_obra_social` y funciones `fn_*`.
Aplicar en el SQL Editor del proyecto Supabase con autorización del equipo.
No es idempotente al 100% en funciones (usa `create or replace`); las tablas usan `if not exists`.

## Verificación

- `npm run build`
- `node --test tests/pacientes.test.mjs`
- `grep` de `.from(` en `src/` = 0
- SQL de apoyo: `supabase/tests/hu04_pacientes.sql` (ejecutar en Supabase con rollback)

## Entrega

PR a `main` (mismo criterio que HU-01/HU-02A). Integración a `develop` cuando el equipo sincronice esa rama.
