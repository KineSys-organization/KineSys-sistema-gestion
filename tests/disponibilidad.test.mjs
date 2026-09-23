import assert from "node:assert/strict";
import test from "node:test";
import {
  fechaMaximaConsulta,
  fechaMinimaConsulta,
  validarConsultaDisponibilidad,
} from "../src/lib/disponibilidad/validar.ts";

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";
const servicio = "7fdc1063-93ed-4e2a-848a-11a0ddbe1bad";

test("exige profesional, servicio y fecha", () => {
  assert.equal(
    validarConsultaDisponibilidad({
      id_profesional: "",
      id_servicio: servicio,
      fecha: fechaMinimaConsulta(),
    }),
    "Elegí un profesional"
  );
  assert.equal(
    validarConsultaDisponibilidad({
      id_profesional: uuid,
      id_servicio: "",
      fecha: fechaMinimaConsulta(),
    }),
    "Elegí un servicio"
  );
});

test("rechaza fecha pasada y más de 30 días", () => {
  assert.equal(
    validarConsultaDisponibilidad({
      id_profesional: uuid,
      id_servicio: servicio,
      fecha: "2020-01-01",
    }),
    "No se puede consultar una fecha pasada"
  );

  const lejos = new Date();
  lejos.setDate(lejos.getDate() + 45);
  assert.equal(
    validarConsultaDisponibilidad({
      id_profesional: uuid,
      id_servicio: servicio,
      fecha: lejos.toISOString().slice(0, 10),
    }),
    "Solo se puede consultar disponibilidad hasta 30 días desde hoy"
  );
});

test("acepta rango válido", () => {
  assert.equal(
    validarConsultaDisponibilidad({
      id_profesional: uuid,
      id_servicio: servicio,
      fecha: fechaMinimaConsulta(),
    }),
    null
  );
  assert.equal(
    validarConsultaDisponibilidad({
      id_profesional: uuid,
      id_servicio: servicio,
      fecha: fechaMaximaConsulta(),
    }),
    null
  );
});
