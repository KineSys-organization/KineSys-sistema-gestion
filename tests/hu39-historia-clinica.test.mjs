import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CAMPOS_FICHA,
  LARGO_MAXIMO_CAMPO_FICHA,
  esIdValido,
  formatearMomento,
  urlHistoria,
  validarFicha,
} from "../src/lib/historia-clinica/validar.ts";

const vacia = {
  antecedentes_personales: "",
  antecedentes_quirurgicos: "",
  alergias: "",
  medicacion_actual: "",
  diagnostico: "",
  observaciones_generales: "",
};

const ID = "0bf85a59-3868-46c3-b390-edb85459bdb4";

test("la ficha tiene los seis campos de la HU, todos de hasta 1000 caracteres", () => {
  assert.deepEqual(
    CAMPOS_FICHA.map((c) => c.nombre).sort(),
    Object.keys(vacia).sort()
  );
  assert.equal(LARGO_MAXIMO_CAMPO_FICHA, 1000);
});

test("todos opcionales, pero no se guarda una ficha vacía", () => {
  assert.equal(validarFicha(vacia), "Completá al menos un campo de la historia clínica");
  assert.equal(validarFicha({ ...vacia, alergias: "   " }), "Completá al menos un campo de la historia clínica");
  assert.equal(validarFicha({ ...vacia, alergias: "Penicilina" }), null);
  assert.equal(validarFicha({ ...vacia, diagnostico: null, alergias: "Penicilina" }), null);
});

test("cada campo admite hasta 1000 caracteres, no más", () => {
  assert.equal(validarFicha({ ...vacia, medicacion_actual: "x".repeat(1000) }), null);
  assert.equal(
    validarFicha({ ...vacia, medicacion_actual: "x".repeat(1001) }),
    "Cada campo de la historia clínica puede tener hasta 1000 caracteres"
  );
  // Los espacios de los bordes no cuentan (la base hace trim).
  assert.equal(validarFicha({ ...vacia, alergias: `  ${"x".repeat(1000)}  ` }), null);
});

test("URL de la historia: recuerda el turno de origen y descarta ids inválidos", () => {
  assert.equal(urlHistoria(ID), `/historia-clinica/${ID}`);
  assert.equal(urlHistoria(ID, { turno: ID, editar: true }), `/historia-clinica/${ID}?turno=${ID}&editar=1`);
  assert.equal(urlHistoria(ID, { turno: "basura", ok: "guardada" }), `/historia-clinica/${ID}?ok=guardada`);
  assert.equal(esIdValido(ID), true);
  assert.equal(esIdValido("123"), false);
});

test("la última modificación se muestra en hora de Argentina", () => {
  assert.equal(formatearMomento("2026-10-05T13:32:00+00:00"), "05/10/2026 10:32");
  assert.equal(formatearMomento("no es fecha"), "no es fecha");
});

test("solo el Profesional: la página exige el rol y las actions chequean antes de la RPC", () => {
  const pagina = readFileSync("src/app/(main)/historia-clinica/[paciente]/page.tsx", "utf8");
  assert.match(pagina, /await exigirProfesional\(\)/);

  const action = readFileSync("src/lib/historia-clinica/actions.ts", "utf8");
  for (const [accion, rpc] of [
    ["historia.consultar", "fn_obtener_historia_clinica"],
    ["historia.registrar", "fn_guardar_historia_clinica"],
  ]) {
    const chequeo = action.indexOf(`exigirAccion("${accion}")`);
    const llamada = action.indexOf(`rpc("${rpc}"`);
    assert.ok(chequeo > 0 && llamada > chequeo, `${accion} va antes de ${rpc}`);
  }
  // El profesional sale de la sesión en la base: el front no lo manda.
  assert.doesNotMatch(action, /id_profesional|\.from\(/);
});

test("la base: tablas con RLS, una ficha por paciente, versiones y turno con el paciente", () => {
  const sql = readFileSync("supabase/migrations/024_hu39_historia_clinica.sql", "utf8");
  assert.match(sql, /unique \(id_paciente\)/);
  assert.match(sql, /create table public\.historia_clinica_version/);
  assert.match(sql, /historia_clinica enable row level security/);
  assert.match(sql, /historia_clinica_version enable row level security/);
  assert.match(sql, /revoke all on public\.historia_clinica from public, anon, authenticated/);
  assert.match(sql, /fn_exigir_rol\(array\['Profesional'\]\)/);
  assert.match(sql, /No tenés turnos con este paciente/);
  assert.doesNotMatch(sql, /delete from public\.historia_clinica/);
});

test("se abre desde el turno del Profesional", () => {
  const turno = readFileSync("src/app/(main)/mi-agenda/[id]/page.tsx", "utf8");
  assert.match(turno, /urlHistoria\(turno\.id_paciente/);
});
