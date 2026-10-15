import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validarRepetir, isoDow } from "../src/lib/turnos/validar.ts";

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";
const base = { idTurno: uuid, modo: "semanas", cantidad: "4", dias: [4], horas: ["10:00"] };

test("sin días marcados se rechaza", () => {
  assert.equal(validarRepetir({ ...base, dias: [], horas: [] }), "Elegí al menos un día de la semana");
});

test("lun-mié-vie con la misma hora y dos días con horas distintas", () => {
  assert.equal(validarRepetir({ ...base, dias: [1, 3, 5], horas: ["10:00", "10:00", "10:00"], cantidad: "4" }), null);
  assert.equal(validarRepetir({ ...base, dias: [2, 4], horas: ["09:00", "18:30"], cantidad: "2" }), null);
});

test("por cantidad de sesiones, con tope de 24", () => {
  assert.equal(validarRepetir({ ...base, modo: "sesiones", cantidad: "10", dias: [1, 3, 5], horas: ["10:00", "10:00", "10:00"] }), null);
  assert.equal(validarRepetir({ ...base, modo: "sesiones", cantidad: "" }), "Indicá cuántas sesiones repetir");
  assert.equal(
    validarRepetir({ ...base, modo: "sesiones", cantidad: "25" }),
    "No se pueden crear más de 24 turnos nuevos en total"
  );
  // 3 días × 9 semanas = 27 turnos
  assert.equal(
    validarRepetir({ ...base, dias: [1, 3, 5], horas: ["10:00", "10:00", "10:00"], cantidad: "9" }),
    "No se pueden crear más de 24 turnos nuevos en total"
  );
});

test("hora inválida o día repetido", () => {
  assert.equal(
    validarRepetir({ ...base, horas: ["10:00:30"] }),
    "La hora indicada no tiene un formato válido (HH:MM)"
  );
  assert.equal(
    validarRepetir({ ...base, dias: [1, 1], horas: ["10:00", "11:00"] }),
    "Un mismo día no se puede elegir dos veces"
  );
  assert.equal(isoDow("2026-10-15"), 4, "el 15/10/2026 es jueves");
});

test("la action manda días, horas y semanas o sesiones", () => {
  const codigo = readFileSync("src/lib/turnos/actions.ts", "utf8");
  assert.match(codigo, /p_dias: campos\.dias/);
  assert.match(codigo, /p_horas: campos\.horas/);
  assert.match(codigo, /p_semanas: campos\.modo === "semanas"/);
  assert.match(codigo, /p_sesiones: campos\.modo === "sesiones"/);
  assert.match(codigo, /fn_turno_repetir_preview/);
  assert.match(codigo, /fn_turno_repetir_confirmar/);
  assert.doesNotMatch(codigo, /supabase\.from\(/);
});
