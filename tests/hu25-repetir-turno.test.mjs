import assert from "node:assert/strict";
import test from "node:test";
import { puedeHacer } from "../src/lib/auth/permisos.ts";
import { MAXIMO_SEMANAS_REPETIR, validarRepetir } from "../src/lib/turnos/validar.ts";

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

test("acepta de 1 a 24 semanas", () => {
  assert.equal(MAXIMO_SEMANAS_REPETIR, 24);
  assert.equal(validarRepetir({ idTurno: uuid, semanas: "1" }), null);
  assert.equal(validarRepetir({ idTurno: uuid, semanas: "24" }), null);
  // Con espacios alrededor también (vienen del formulario).
  assert.equal(validarRepetir({ idTurno: ` ${uuid} `, semanas: " 4 " }), null);
});

test("rechaza 0 y 25 semanas", () => {
  const mensaje = "Podés repetir el turno entre 1 y 24 semanas";
  assert.equal(validarRepetir({ idTurno: uuid, semanas: "0" }), mensaje);
  assert.equal(validarRepetir({ idTurno: uuid, semanas: "25" }), mensaje);
});

test("exige un número entero de semanas", () => {
  assert.equal(validarRepetir({ idTurno: uuid, semanas: "" }), "Indicá cuántas semanas repetir");
  const mensaje = "La cantidad de semanas tiene que ser un número entero";
  assert.equal(validarRepetir({ idTurno: uuid, semanas: "2.5" }), mensaje);
  assert.equal(validarRepetir({ idTurno: uuid, semanas: "-3" }), mensaje);
  assert.equal(validarRepetir({ idTurno: uuid, semanas: "cuatro" }), mensaje);
});

test("rechaza un turno inválido", () => {
  assert.equal(validarRepetir({ idTurno: "no-es-uuid", semanas: "4" }), "Turno inválido");
});

test("solo Gerente y Mesa de Entradas pueden repetir turnos", () => {
  assert.equal(puedeHacer("Gerente", "turnos.repetir"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "turnos.repetir"), true);
  assert.equal(puedeHacer("Profesional", "turnos.repetir"), false);
  assert.equal(puedeHacer("Paciente", "turnos.repetir"), false);
});
