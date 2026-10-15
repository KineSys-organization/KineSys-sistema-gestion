# HU-39 — Registrar y consultar la historia clínica del paciente

Rama: `feature/hu-39-historia-clinica`. Issue: #73. Se apoya en HU-12/HU-13 (mi agenda y atención) y HU-24A (orden médica). HU-16 (#16) va a mostrar esta misma ficha arriba del historial.

> Como Profesional quiero registrar y consultar la historia clínica del paciente, para tener a mano sus antecedentes y diagnóstico al atenderlo, sin preguntarlos en cada sesión.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Desde un turno propio (`/mi-agenda/[id]`) el Profesional abre **Historia clínica** | ✅ |
| 2 | Ficha clínica (seis campos opcionales de hasta 1000 caracteres) + Evolución (atenciones de HU-13, de la más reciente a la más antigua, con fecha, profesional, motivo, observaciones y orden médica) | ✅ |
| 3 | Sin ficha: *Todavía no se cargó la historia clínica* y **Completar historia clínica** | ✅ |
| 4 | Queda quién y cuándo la modificó (*Última modificación: …*) y el historial de versiones anteriores | ✅ |
| 5 | Una sola ficha por paciente, compartida por los profesionales que lo atienden | ✅ |
| 6 | Solo Profesionales con al menos un turno con el paciente; si no, *No tenés turnos con este paciente* sin datos | ✅ |
| 7 | Mesa de Entradas y Gerente no la ven | ✅ |
| 8 | (Should) Imprimir / descargar en PDF con el logo (mecanismo de HU-27) | ✅ |
| 9 | Datos por `fn_*` nuevas, id del profesional desde `auth.uid()`, ruta y acciones en `permisos.ts`, sin `supabase.from` | ✅ |

## Flujo

1. El Profesional abre un turno suyo en **Mi agenda** y toca **Historia clínica** → `/historia-clinica/[paciente]?turno=[id]`.
2. Arriba los datos del paciente (DNI, edad, teléfono). Después la **Ficha clínica**:
   - sin ficha → aviso + **Completar historia clínica**;
   - con ficha → los seis campos (vacíos con "—"), *Última modificación: Nombre Apellido, dd/mm/aaaa hh:mm*, **Editar historia clínica**, **Descargar PDF** y, si hubo ediciones, **Versiones anteriores (N)** desplegable (quién la escribió, cuándo y cuándo quedó reemplazada, con sus valores).
3. El formulario (`?editar=1`) muestra los seis campos con contador `x / 1000`. **Guardar** vuelve a la ficha con *Historia clínica guardada*. Una ficha toda vacía se rechaza.
4. Abajo la **Evolución**: cada atención con fecha, hora, profesional, servicio, motivo, observaciones y orden médica.
5. **← Volver al turno** regresa a `/mi-agenda/[id]`.

## Backend — `supabase/migrations/024_hu39_historia_clinica.sql`

- `historia_clinica`: `unique(id_paciente)`, `antecedentes_personales`, `antecedentes_quirurgicos` (quirúrgicos y traumatológicos), `alergias`, `medicacion_actual`, `diagnostico`, `observaciones_generales` (check ≤ 1000), `creado_en/por`, `modificado_en/por`.
- `historia_clinica_version`: copia de los seis textos + `modificado_en/por` de esa versión + `reemplazada_en`.
- Las dos con RLS y `revoke all` a `public, anon, authenticated`: solo se accede por las funciones.
- `fn_exigir_paciente_propio(uuid)` (interna): `fn_exigir_rol(['Profesional'])` + existe un turno del paciente con `id_profesional = auth.uid()`. Mismo mensaje si el paciente no existe.
- `fn_obtener_historia_clinica(paciente)` → `{ paciente, ficha (null si no hay), versiones, evolucion }`.
- `fn_guardar_historia_clinica(paciente, 6 textos)`: trim, vacío = null, al menos un campo, ≤ 1000. Lock por paciente (dos profesionales guardando a la vez se atienden de a uno). Si existe y cambió: copia la versión anterior y actualiza; si no cambió, no crea versión.

## Front

- `src/lib/historia-clinica/`: `tipos.ts`, `validar.ts` (`CAMPOS_FICHA`, `validarFicha`, `urlHistoria`, `formatearMomento`) y `actions.ts` (`obtenerHistoriaClinica`, `guardarHistoriaClinica`, cada una con `exigirAccion` antes de la RPC).
- `src/app/(main)/historia-clinica/[paciente]/page.tsx` (Server Component con `exigirProfesional()`).
- `src/components/historia-clinica/HistoriaClinicaForm.tsx` (cliente, `useActionState`) y `ImprimirHistoriaButton.tsx` (`window.print()`).
- `src/app/(main)/mi-agenda/[id]/page.tsx`: botón **Historia clínica**.
- `src/lib/auth/permisos.ts`: ruta `/historia-clinica` y acciones `historia.consultar` / `historia.registrar` (solo Profesional).
- `globals.css`: `.ficha-clinica`, `.versiones-historia`, `.lista-evolucion`, `.historia-impresion` (en impresión `position: absolute` para que salgan todas las páginas).

## Pruebas

| Criterio | Prueba |
|---|---|
| 2, 3 | SQL: paciente sin ficha → `ficha` null; la evolución trae la atención con motivo y orden médica |
| 2 | SQL + unit: ficha vacía rechazada; 1000 caracteres sí, 1001 no; los seis campos de la HU |
| 4 | SQL: crear deja `modificado_por`; guardar sin cambios no crea versión; editar guarda la versión anterior con sus valores |
| 5 | SQL: una sola fila por paciente; el profesional B ve y edita la misma ficha (2 versiones, última modificación a su nombre) |
| 6 | SQL: profesional sin turnos con el paciente y paciente inexistente → *No tenés turnos con este paciente* (ver y editar); con un turno **cancelado** ya puede |
| 7 | SQL: Mesa de Entradas, Gerente y cuenta sin fila → *No tenés permisos*; `authenticated` no lee la tabla directo. Unit: matriz HU-08 |
| 9 | Unit: la página usa `exigirProfesional`; las actions chequean antes de la RPC y no mandan `id_profesional`; RLS y `unique` en la migración |

Verificación visual (14/10/2026, Profesional Juarez, Agustin, paciente Serrano, Amparo): botón en el turno, paciente sin ficha, completar, editar, versiones anteriores, ficha vacía rechazada y Mesa de Entradas redirigida a Inicio con *No tenés permisos*. La ficha de prueba se borró después.

### Cómo correrlas

- `npm test` (incluye `tests/hu39-historia-clinica.test.mjs` y la matriz de `tests/hu08-acceso.test.mjs`).
- `supabase/tests/hu39_historia_clinica.sql` en el SQL Editor (todo termina en `rollback`).

## Aplicación

Migración `024` aplicada en el proyecto `dbfehkykxsqgpctskuuq` el 14/10/2026.

## Otros cambios del PR

`tsconfig.json` excluye `supabase/functions`: desde HU-29 `npm run build` fallaba porque Next revisaba los tipos de la edge function de Deno `crear-usuario-gestion` (usa `Deno` y `https://esm.sh/...`).
