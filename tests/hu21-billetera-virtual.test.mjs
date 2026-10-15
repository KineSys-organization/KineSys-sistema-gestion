import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  calcularPago,
  esNumeroOperacionValido,
  etiquetaMedio,
  leerFiltrosPagos,
  MENSAJE_NUMERO_OPERACION,
  numeroOperacionParaRpc,
  pideNumeroOperacion,
  urlPagos,
  validarCorreccion,
} from "../src/lib/pagos/validar.ts";

// HU-21. Registrar cobro mediante billetera virtual (issue #21). Sin integración con APIs.

const base = { importeBase: "15000", descuento: "", conObraSocial: false };

test("Billetera virtual es un medio más de HU-14", () => {
  assert.equal(etiquetaMedio("billetera"), "Billetera virtual");
  assert.equal(pideNumeroOperacion("billetera"), true);
  for (const medio of ["efectivo", "transferencia", "debito", "credito"]) {
    assert.equal(pideNumeroOperacion(medio), false, medio);
  }
});

test("nº de operación: 4 a 50 letras y/o números, sin espacios", () => {
  for (const bueno of ["1234", "MP123456789", "abcd1234", "A".repeat(50), "  MODO0001  "]) {
    assert.equal(esNumeroOperacionValido(bueno), true, bueno);
  }
  for (const malo of ["", "123", "AB 12", "12-34", "12.345", "A".repeat(51), "ñandú12"]) {
    assert.equal(esNumeroOperacionValido(malo), false, malo);
  }
});

test("con billetera el nº es obligatorio; con otros medios no se pide", () => {
  assert.deepEqual(calcularPago({ ...base, medio: "billetera" }), { error: MENSAJE_NUMERO_OPERACION });
  assert.deepEqual(calcularPago({ ...base, medio: "billetera", numeroOperacion: "12 3" }), {
    error: "Ingresá un número de operación válido",
  });
  assert.ok("importes" in calcularPago({ ...base, medio: "billetera", numeroOperacion: "MP1234" }));
  assert.ok("importes" in calcularPago({ ...base, medio: "efectivo" }));
});

test("importes y descuento siguen las reglas de HU-14", () => {
  assert.deepEqual(
    calcularPago({ ...base, medio: "billetera", numeroOperacion: "MP1234", descuento: "100" }),
    { error: "Solo se aplica descuento si el turno tiene cobertura de obra social" }
  );
});

test("corregir hacia billetera exige el nº; hacia otro medio se quita", () => {
  assert.equal(
    validarCorreccion({ ...base, medio: "billetera", motivo: "Era MP" }),
    MENSAJE_NUMERO_OPERACION
  );
  assert.equal(
    validarCorreccion({ ...base, medio: "billetera", numeroOperacion: "MP1234", motivo: "Era MP" }),
    null
  );
  assert.equal(numeroOperacionParaRpc("billetera", "  MP1234 "), "MP1234");
  assert.equal(numeroOperacionParaRpc("efectivo", "MP1234"), null);
});

test("listado: filtro por medio en la URL", () => {
  const f = leerFiltrosPagos({ medio: "billetera" });
  assert.equal(f.medio, "billetera");
  assert.equal(urlPagos(f), "/pagos?medio=billetera");
  assert.equal(leerFiltrosPagos({ medio: "bitcoin" }).medio, null);
});

const leer = (...partes) => readFileSync(join(...partes), "utf8");

test("migración 028: check, columna, único y drop + create", () => {
  const sql = leer("supabase", "migrations", "028_hu21_billetera_virtual.sql");
  assert.match(sql, /'efectivo', 'transferencia', 'debito', 'credito', 'billetera'/);
  assert.match(sql, /add column if not exists numero_operacion text;/);
  assert.match(sql, /check \(\(medio_pago = 'billetera'\) = \(numero_operacion is not null\)\)/);
  assert.match(sql, /create unique index if not exists idx_pago_numero_operacion/);
  assert.match(sql, /drop function if exists public\.fn_registrar_pago\(uuid, numeric, numeric, text\);/);
  assert.match(sql, /drop function if exists public\.fn_corregir_pago\(uuid, numeric, numeric, text, text\);/);
  assert.match(sql, /drop function if exists public\.fn_listar_pagos\(text, date, date, integer, text\);/);
  assert.match(sql, /'Ingresá un número de operación válido'/);
  assert.match(sql, /'Ese número de operación ya está registrado en otro pago'/);
  // Sin integración con billeteras.
  assert.doesNotMatch(sql, /http|webhook/i);
});

test("las actions mandan p_numero_operacion por rpc y siguen con pagos.*", () => {
  const actions = leer("src", "lib", "pagos", "actions.ts");
  assert.equal(actions.match(/p_numero_operacion: numeroOperacionParaRpc/g)?.length, 2);
  assert.match(actions, /p_medio: filtros\.medio/);
  assert.match(actions, /exigirAccion\("pagos\.registrar"\)/);
  assert.match(actions, /exigirAccion\("pagos\.corregir"\)/);
  assert.doesNotMatch(actions, /\.from\(/);
});
