import assert from "node:assert/strict";
import test from "node:test";
import {
  coberturaInicial,
  coberturaParaRpc,
  esIdTurno,
  formatearFecha,
  PARTICULAR,
  validarOtorgarTurno,
} from "../src/lib/turnos/validar.ts";

const paciente = "1583bc01-bdb4-4859-935c-0f4818505aed";
const profesional = "7fdc1063-93ed-4e2a-848a-11a0ddbe1bad";
const servicio = "2b6f0cc9-3a1e-4c6b-9d2f-5a7e8c1d2e3f";
const obra = "9c2d4e6f-1a3b-4c5d-8e7f-0a1b2c3d4e5f";

function manana() {
  const dia = new Date();
  dia.setDate(dia.getDate() + 1);
  const mm = String(dia.getMonth() + 1).padStart(2, "0");
  const dd = String(dia.getDate()).padStart(2, "0");
  return `${dia.getFullYear()}-${mm}-${dd}`;
}

function campos(extra = {}) {
  return {
    id_paciente: paciente,
    id_profesional: profesional,
    id_servicio: servicio,
    fecha: manana(),
    hora: "17:00",
    cobertura: obra,
    ...extra,
  };
}

test("C1: acepta un turno completo y exige paciente", () => {
  assert.equal(validarOtorgarTurno(campos()), null);
  assert.equal(validarOtorgarTurno(campos({ cobertura: PARTICULAR })), null);
  assert.equal(validarOtorgarTurno(campos({ id_paciente: "" })), "Elegí un paciente");
  assert.equal(validarOtorgarTurno(campos({ id_servicio: "x" })), "Servicio inválido");
  assert.equal(validarOtorgarTurno(campos({ hora: "25:00" })), "La hora no es válida");
});

test("C4: rechaza fecha u hora anteriores a la actual", () => {
  const error = "No se pueden otorgar turnos con fecha anterior a la actual";
  assert.equal(validarOtorgarTurno(campos({ fecha: "2020-01-01" })), error);

  const hoy = new Date();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  assert.equal(
    validarOtorgarTurno(campos({ fecha: `${hoy.getFullYear()}-${mm}-${dd}`, hora: "00:00" })),
    error
  );
});

test("C6: la cobertura es obligatoria y Particular se envía como null", () => {
  assert.equal(
    validarOtorgarTurno(campos({ cobertura: "" })),
    "Elegí con qué cobertura se atiende"
  );
  assert.equal(validarOtorgarTurno(campos({ cobertura: "osde" })), "Cobertura inválida");
  assert.equal(coberturaParaRpc(PARTICULAR), null);
  assert.equal(coberturaParaRpc(obra), obra);
});

test("C6: preselección de cobertura según las obras del paciente", () => {
  const osde = { id_obra_social: obra, nombre_obra_social: "OSDE", numero_afiliado: "1" };
  const galeno = {
    id_obra_social: profesional,
    nombre_obra_social: "Galeno",
    numero_afiliado: "2",
  };
  const inactiva = { ...osde, activo: false };

  assert.equal(coberturaInicial([osde]), obra);
  assert.equal(coberturaInicial([]), PARTICULAR);
  assert.equal(coberturaInicial([osde, galeno]), "");
  assert.equal(coberturaInicial([inactiva]), PARTICULAR);
  assert.equal(coberturaInicial([osde, { ...galeno, activo: false }]), obra);
});

test("C5: el resumen muestra el día legible", () => {
  assert.equal(formatearFecha("2026-09-28"), "lunes, 28 de septiembre de 2026");
  assert.equal(esIdTurno(paciente), true);
  assert.equal(esIdTurno("no-es-uuid"), false);
});
