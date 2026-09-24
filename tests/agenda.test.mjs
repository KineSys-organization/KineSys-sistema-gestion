import assert from "node:assert/strict";
import test from "node:test";
import { validarConsultaAgenda } from "../src/lib/agenda/validar.ts";

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

test("exige profesional y fecha para consultar la agenda", () => {
  assert.equal(
    validarConsultaAgenda({ id_profesional: "", fecha: "2026-09-23" }),
    "Elegí un profesional"
  );
  assert.equal(
    validarConsultaAgenda({ id_profesional: uuid, fecha: "" }),
    "Elegí una fecha"
  );
});

test("rechaza un profesional o fecha inválidos", () => {
  assert.equal(
    validarConsultaAgenda({ id_profesional: "no-es-uuid", fecha: "2026-09-23" }),
    "Profesional inválido"
  );
  assert.equal(
    validarConsultaAgenda({ id_profesional: uuid, fecha: "no-es-fecha" }),
    "La fecha no es válida"
  );
});

test("acepta fechas pasadas y futuras", () => {
  assert.equal(
    validarConsultaAgenda({ id_profesional: uuid, fecha: "2020-01-01" }),
    null
  );
  assert.equal(
    validarConsultaAgenda({ id_profesional: uuid, fecha: "2030-01-01" }),
    null
  );
});
