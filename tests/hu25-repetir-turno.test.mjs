import assert from "node:assert/strict";
import test from "node:test";
import { puedeHacer } from "../src/lib/auth/permisos.ts";
import { MAXIMO_SEMANAS_REPETIR, validarRepetir } from "../src/lib/turnos/validar.ts";

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";
const base = { idTurno: uuid, modo: "semanas", dias: [4], horas: ["10:00"] };

test("acepta de 1 a 24 semanas en un solo día", () => {
  assert.equal(MAXIMO_SEMANAS_REPETIR, 24);
  assert.equal(validarRepetir({ ...base, cantidad: "1" }), null);
  assert.equal(validarRepetir({ ...base, cantidad: "24" }), null);
  assert.equal(validarRepetir({ ...base, idTurno: ` ${uuid} `, cantidad: " 4 " }), null);
});

test("rechaza 0 semanas y más de 24 turnos", () => {
  assert.equal(
    validarRepetir({ ...base, cantidad: "0" }),
    "La cantidad de semanas o de sesiones tiene que ser mayor a cero"
  );
  assert.equal(
    validarRepetir({ ...base, cantidad: "25" }),
    "No se pueden crear más de 24 turnos nuevos en total"
  );
});

test("exige un número entero de semanas", () => {
  assert.equal(validarRepetir({ ...base, cantidad: "" }), "Indicá cuántas semanas repetir");
  const mensaje = "La cantidad de semanas o de sesiones tiene que ser un número entero";
  assert.equal(validarRepetir({ ...base, cantidad: "2.5" }), mensaje);
  assert.equal(validarRepetir({ ...base, cantidad: "-3" }), mensaje);
  assert.equal(validarRepetir({ ...base, cantidad: "cuatro" }), mensaje);
});

test("rechaza un turno inválido", () => {
  assert.equal(validarRepetir({ ...base, idTurno: "no-es-uuid" }), "Turno inválido");
});

test("solo Gerente y Mesa de Entradas pueden repetir turnos", () => {
  assert.equal(puedeHacer("Gerente", "turnos.repetir"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "turnos.repetir"), true);
  assert.equal(puedeHacer("Profesional", "turnos.repetir"), false);
  assert.equal(puedeHacer("Paciente", "turnos.repetir"), false);
});
