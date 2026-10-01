import assert from "node:assert/strict";
import test from "node:test";
import { esIdObraSocial, validarNombreObraSocial } from "../src/lib/obras-sociales/validar.ts";
import { obrasDelPacienteEnFormulario } from "../src/lib/pacientes/validar.ts";

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

test("el id de la obra tiene que ser un uuid", () => {
  assert.equal(esIdObraSocial("9c2d4e6f-1a3b-4c5d-8e7f-0a1b2c3d4e5f"), true);
  assert.equal(esIdObraSocial("no"), false);
});

test("al editar un paciente se conservan las obras inactivas que ya tenía", () => {
  const activa = { id_obra_social: "9c2d4e6f-1a3b-4c5d-8e7f-0a1b2c3d4e5f", nombre_obra_social: "OSDE" };
  const inactiva = {
    id_obra_social: "7fdc1063-93ed-4e2a-848a-11a0ddbe1bad",
    nombre_obra_social: "Galeno",
    numero_afiliado: "2",
    activo: false,
  };
  const visibles = obrasDelPacienteEnFormulario([activa], [inactiva]);
  assert.equal(visibles.length, 2);
  assert.equal(visibles.find((obra) => obra.id_obra_social === inactiva.id_obra_social)?.activo, false);
});
