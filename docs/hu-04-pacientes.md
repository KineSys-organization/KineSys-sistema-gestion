# HU-04 — Registrar, localizar y editar paciente

Rama: `feature/hu-04-pacientes`. Issue: #4.

## Implementación

- `/pacientes`: búsqueda por DNI o nombre/apellido.
- `/pacientes/nuevo`: alta con datos personales y obras sociales opcionales.
- `/pacientes/[id]`: edición de contacto y obras; DNI y fecha de nacimiento solo lectura.
- Roles: Gerente y Mesa de Entradas (`exigirRecepcion` + `fn_es_recepcion` en SQL).
- Particular no se asocia al paciente; sin obras = particular al momento del turno.
- Catálogo de obras sociales precargado; administración fuera de alcance.
- Front solo RPC; sin `supabase.from`.

## Base de datos (importante)

`public.paciente` **ya existía** (alta de mostrador + `fn_completar_registro_paciente` de la web de pacientes).

La migración `003_hu04_pacientes.sql`:

- **No** recrea `paciente`.
- Agrega `mail_paciente`.
- Crea catálogo `obra_social` + puente `paciente_obra_social`.
- Reemplaza `fn_registrar_paciente` (firma vieja con `p_obra_social text`) por la de gestión (`p_mail` + `p_obras jsonb`).
- Agrega `fn_buscar_pacientes`, `fn_obtener_paciente`, `fn_editar_paciente`, `fn_listar_obras_sociales`.
- Deja intacta `fn_completar_registro_paciente`.
- Sincroniza la columna texto legacy `paciente.obra_social` al guardar obras N:M (compatibilidad).

## Verificación

- `npm run build`
- `node --test tests/pacientes.test.mjs`
- `grep` de `.from(` en `src/` = 0
- SQL de apoyo: `supabase/tests/hu04_pacientes.sql`

## Entrega

PR a `main`. La rama incluye merge de HU-02B.
