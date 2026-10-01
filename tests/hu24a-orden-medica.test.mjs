import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { LARGO_MAXIMO_ORDEN_MEDICA, validarAtencion } from "../src/lib/atencion/validar.ts";

// HU-24A. Orden médica al atender un turno (issue #44).

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";
const base = { idTurno: uuid, observaciones: "Sesión 1", motivo: "" };

// ============ Validación del front ============

test("la orden médica es opcional (vacía, solo espacios o sin el campo)", () => {
  assert.equal(validarAtencion({ ...base, orden: "" }), null);
  assert.equal(validarAtencion({ ...base, orden: "   \n  " }), null);
  // Llamadas de HU-13 sin el campo siguen andando.
  assert.equal(validarAtencion(base), null);
});

test("largo máximo 2000 (igual que el check de la tabla y la función)", () => {
  assert.equal(LARGO_MAXIMO_ORDEN_MEDICA, 2000);
  assert.equal(validarAtencion({ ...base, orden: "o".repeat(2000) }), null);
  assert.equal(
    validarAtencion({ ...base, orden: "o".repeat(2001) }),
    "La orden médica no puede superar los 2000 caracteres"
  );
  // Se cuenta después del trim, como en la base.
  assert.equal(validarAtencion({ ...base, orden: `  ${"o".repeat(2000)}  ` }), null);
});

test("la orden no reemplaza a las observaciones ni cambia las reglas de HU-13", () => {
  assert.equal(
    validarAtencion({ ...base, observaciones: "", orden: "Dx: lumbalgia" }),
    "Tenés que escribir las observaciones de la atención"
  );
  assert.equal(
    validarAtencion({ ...base, motivo: "m".repeat(201), orden: "Dx" }),
    "El motivo de consulta no puede superar los 200 caracteres"
  );
});

// ============ Chequeos sobre el código ============

const leer = (...partes) => readFileSync(join(...partes), "utf8");

test("las server actions mandan p_orden_medica al rpc, sin supabase.from", () => {
  const actions = leer("src", "lib", "atencion", "actions.ts");
  assert.equal(actions.match(/p_orden_medica: campos\.orden\.trim\(\) \|\| null/g)?.length, 2);
  assert.match(actions, /formData\.get\("orden_medica"\)/);
  assert.doesNotMatch(actions, /\.from\(/);
});

test("migración 019: sin sobrecargas, orden solo para el profesional dueño", () => {
  const sql = leer("supabase", "migrations", "019_hu24a_orden_medica.sql");

  // Columna opcional con el mismo límite.
  assert.match(sql, /add column orden_medica text;/);
  assert.match(sql, /check \(orden_medica is null or char_length\(orden_medica\) <= 2000\)/);

  // Se borran las firmas viejas antes de recrear (si no, rpc queda ambiguo).
  assert.match(sql, /drop function if exists public\.fn_registrar_atencion\(uuid, text, text\);/);
  assert.match(sql, /drop function if exists public\.fn_editar_atencion\(uuid, text, text\);/);
  assert.match(sql, /grant execute on function public\.fn_registrar_atencion\(uuid, text, text, text\) to authenticated/);
  assert.match(sql, /grant execute on function public\.fn_editar_atencion\(uuid, text, text, text\) to authenticated/);

  // Registrar y editar siguen exigiendo el turno propio y normalizan la orden.
  for (const fn of ["fn_registrar_atencion(", "fn_editar_atencion("]) {
    const cuerpo = sql.slice(sql.indexOf(`create function public.${fn}`));
    assert.match(cuerpo, /perform public\.fn_exigir_turno_propio\(p_id_turno\)/, fn);
    assert.match(cuerpo, /v_orden text := nullif\(trim\(p_orden_medica\), ''\)/, fn);
  }

  // La orden va DENTRO de 'atencion', que solo se arma para el profesional que atendió.
  const obtener = sql.slice(sql.indexOf("function public.fn_obtener_turno"));
  const rama = obtener.slice(obtener.indexOf("'atencion', case"), obtener.indexOf("else null"));
  assert.match(rama, /a\.id_profesional = auth\.uid\(\)/);
  assert.match(rama, /'orden_medica', a\.orden_medica/);
  // Y en ningún otro lado del JSON (una sola línea: la clave y la columna).
  assert.equal(obtener.match(/'orden_medica'/g)?.length, 1);
});
