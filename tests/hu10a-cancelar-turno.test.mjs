import assert from "node:assert/strict";
import test from "node:test";
import {
  etiquetaMotivo,
  MOTIVOS_CANCELACION,
  validarCancelacion,
} from "../src/lib/turnos/validar.ts";

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

test("CA5: sin motivo se rechaza", () => {
  assert.equal(
    validarCancelacion({ idTurno: uuid, motivo: "", detalle: "" }),
    "Tenés que indicar el motivo de la cancelación"
  );
  assert.equal(
    validarCancelacion({ idTurno: uuid, motivo: "   ", detalle: "" }),
    "Tenés que indicar el motivo de la cancelación"
  );
});

test("rechaza un motivo fuera de la lista", () => {
  assert.equal(
    validarCancelacion({ idTurno: uuid, motivo: "porque si", detalle: "" }),
    "El motivo de cancelación no es válido"
  );
});

test("rechaza un detalle de más de 200 caracteres", () => {
  assert.equal(
    validarCancelacion({ idTurno: uuid, motivo: "otro", detalle: "x".repeat(201) }),
    "El detalle no puede superar los 200 caracteres"
  );
  // 200 justos está permitido.
  assert.equal(
    validarCancelacion({ idTurno: uuid, motivo: "otro", detalle: "x".repeat(200) }),
    null
  );
});

test("rechaza un turno inválido", () => {
  assert.equal(
    validarCancelacion({ idTurno: "no-es-uuid", motivo: "otro", detalle: "" }),
    "Turno inválido"
  );
});

test("acepta cada motivo de la lista, con y sin detalle", () => {
  for (const motivo of MOTIVOS_CANCELACION) {
    assert.equal(
      validarCancelacion({ idTurno: uuid, motivo: motivo.valor, detalle: "" }),
      null
    );
  }
  assert.equal(
    validarCancelacion({
      idTurno: uuid,
      motivo: "pedido_paciente",
      detalle: "Avisó por teléfono",
    }),
    null
  );
});

test("la lista de motivos tiene las etiquetas de la HU", () => {
  assert.deepEqual(
    MOTIVOS_CANCELACION.map((m) => m.etiqueta),
    ["A pedido del paciente", "Por el profesional", "Otro"]
  );
  assert.equal(etiquetaMotivo("profesional"), "Por el profesional");
  assert.equal(etiquetaMotivo(null), "");
});
