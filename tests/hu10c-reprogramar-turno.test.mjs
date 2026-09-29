import assert from "node:assert/strict";
import test from "node:test";
import { urlReprogramar, validarReprogramacion } from "../src/lib/turnos/validar.ts";

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

test("acepta turno, fecha y hora válidos", () => {
  assert.equal(validarReprogramacion({ idTurno: uuid, fecha: "2026-10-05", hora: "09:30" }), null);
  // Con espacios alrededor también (vienen del formulario).
  assert.equal(
    validarReprogramacion({ idTurno: ` ${uuid} `, fecha: " 2026-10-05 ", hora: " 09:30 " }),
    null
  );
});

test("rechaza un turno inválido", () => {
  assert.equal(
    validarReprogramacion({ idTurno: "no-es-uuid", fecha: "2026-10-05", hora: "09:30" }),
    "Turno inválido"
  );
});

test("exige el nuevo día y horario", () => {
  assert.equal(
    validarReprogramacion({ idTurno: uuid, fecha: "", hora: "09:30" }),
    "Elegí el nuevo día y horario"
  );
  assert.equal(
    validarReprogramacion({ idTurno: uuid, fecha: "2026-10-05", hora: "  " }),
    "Elegí el nuevo día y horario"
  );
});

test("rechaza fechas y horas mal formadas o inexistentes", () => {
  assert.equal(
    validarReprogramacion({ idTurno: uuid, fecha: "05/10/2026", hora: "09:30" }),
    "La fecha no es válida"
  );
  assert.equal(
    validarReprogramacion({ idTurno: uuid, fecha: "2026-02-30", hora: "09:30" }),
    "La fecha no es válida"
  );
  assert.equal(
    validarReprogramacion({ idTurno: uuid, fecha: "2026-10-05", hora: "25:00" }),
    "La hora no es válida"
  );
  assert.equal(
    validarReprogramacion({ idTurno: uuid, fecha: "2026-10-05", hora: "9:30" }),
    "La hora no es válida"
  );
});

test("urlReprogramar conserva el día y el horario elegidos", () => {
  assert.equal(urlReprogramar(uuid), `/turnos/${uuid}/reprogramar`);
  assert.equal(
    urlReprogramar(uuid, { fecha: "2026-10-05" }),
    `/turnos/${uuid}/reprogramar?fecha=2026-10-05`
  );
  assert.equal(
    urlReprogramar(uuid, { fecha: "2026-10-05", hora: "09:30" }),
    `/turnos/${uuid}/reprogramar?fecha=2026-10-05&hora=09%3A30`
  );
});
