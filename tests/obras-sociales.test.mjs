import assert from "node:assert/strict";
import test from "node:test";
import { validarNombreObraSocial } from "../src/lib/obras-sociales/validar.ts";

test("recorta espacios y acepta nombres de 2 a 80 caracteres", () => {
  assert.equal(validarNombreObraSocial("  OSDE  "), null);
  assert.equal(validarNombreObraSocial("AB"), null);
  assert.equal(validarNombreObraSocial("A".repeat(80)), null);
});

test("rechaza nombres vacíos, demasiado cortos o demasiado largos", () => {
  assert.equal(validarNombreObraSocial("   "), "El nombre de la obra social es obligatorio");
  assert.equal(validarNombreObraSocial("A"), "El nombre debe tener entre 2 y 80 caracteres");
  assert.equal(validarNombreObraSocial("A".repeat(81)), "El nombre debe tener entre 2 y 80 caracteres");
});
