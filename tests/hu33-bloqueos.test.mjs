import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { puedeAcceder, puedeHacer } from "../src/lib/auth/permisos.ts";
import {
  bloqueosEnFecha,
  domingoDeSemanas,
  lunesDe,
  textoBloqueo,
  validarBloqueo,
} from "../src/lib/bloqueos/validar.ts";

const hoy = "2026-10-15";
const base = {
  idProfesional: "",
  desde: "2026-10-20",
  hasta: "2026-10-20",
  horaDesde: "",
  horaHasta: "",
  motivo: "Feriado",
};

test("feriado del centro: un día completo", () => {
  assert.equal(validarBloqueo(base, hoy), null);
});

test("licencia de un profesional y bloqueo parcial", () => {
  const id = "1583bc01-bdb4-4859-935c-0f4818505aed";
  assert.equal(validarBloqueo({ ...base, idProfesional: id, desde: "2026-11-02", hasta: "2026-11-06" }, hoy), null);
  assert.equal(
    validarBloqueo({ ...base, horaDesde: "14:00", horaHasta: "18:00", motivo: "Capacitación" }, hoy),
    null
  );
});

test("rechaza hasta anterior, fechas pasadas, hora invertida, más de 90 días y motivo vacío", () => {
  assert.equal(
    validarBloqueo({ ...base, hasta: "2026-10-19" }, hoy),
    "La fecha hasta no puede ser anterior a la fecha desde"
  );
  assert.equal(
    validarBloqueo({ ...base, desde: "2026-10-01", hasta: "2026-10-01" }, hoy),
    "No se pueden bloquear fechas pasadas"
  );
  assert.equal(
    validarBloqueo({ ...base, horaDesde: "18:00", horaHasta: "14:00" }, hoy),
    "La hora de fin debe ser posterior a la de inicio"
  );
  assert.equal(
    validarBloqueo({ ...base, horaDesde: "14:00", horaHasta: "" }, hoy),
    "Completá la hora desde y la hora hasta, o dejá las dos vacías"
  );
  assert.equal(
    validarBloqueo({ ...base, desde: "2026-10-15", hasta: "2027-01-20" }, hoy),
    "El bloqueo no puede superar los 90 días"
  );
  assert.equal(validarBloqueo({ ...base, motivo: "   " }, hoy), "Indicá el motivo del bloqueo");
  assert.equal(
    validarBloqueo({ ...base, motivo: "x".repeat(101) }, hoy),
    "El motivo no puede superar los 100 caracteres"
  );
});

test("atajo por semanas: lunes a domingo", () => {
  assert.equal(lunesDe("2026-10-15"), "2026-10-12");
  assert.equal(domingoDeSemanas("2026-10-15", 1), "2026-10-18");
  assert.equal(domingoDeSemanas("2026-10-15", 2), "2026-10-25");
});

test("un bloqueo se muestra en los días del rango", () => {
  const bloqueo = {
    id_bloqueo: "1",
    alcance: "centro",
    fecha_desde: "2026-10-20",
    fecha_hasta: "2026-10-22",
    hora_desde: null,
    hora_hasta: null,
    dia_completo: true,
    motivo: "Feriado",
  };
  assert.equal(bloqueosEnFecha("2026-10-21", [bloqueo]).length, 1);
  assert.equal(bloqueosEnFecha("2026-10-23", [bloqueo]).length, 0);
  assert.equal(textoBloqueo(bloqueo), "Todo el centro · Día completo · Feriado");
});

test("solo el Gerente entra a /bloqueos y los gestiona; todos los ven en la agenda", () => {
  assert.equal(puedeAcceder("Gerente", "/bloqueos"), true);
  assert.equal(puedeAcceder("Mesa de Entradas", "/bloqueos"), false);
  assert.equal(puedeAcceder("Profesional", "/bloqueos"), false);
  assert.equal(puedeHacer("Gerente", "bloqueos.gestionar"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "bloqueos.gestionar"), false);
  assert.equal(puedeHacer("Profesional", "bloqueos.consultar"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "bloqueos.consultar"), true);
});

test("el front invoca las funciones de bloqueo y no consulta tablas", () => {
  const codigo = readFileSync("src/lib/bloqueos/actions.ts", "utf8");
  assert.match(codigo, /fn_crear_bloqueo/);
  assert.match(codigo, /fn_listar_bloqueos/);
  assert.match(codigo, /fn_eliminar_bloqueo/);
  assert.match(codigo, /fn_consultar_bloqueos_agenda/);
  assert.match(codigo, /p_solo_consultar: soloConsultar/);
  assert.doesNotMatch(codigo, /supabase\.from\(/);
});
