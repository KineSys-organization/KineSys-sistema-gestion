import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  calcularEdad,
  esFechaValida,
  hoyArgentina,
  LARGO_MAXIMO_MOTIVO_CONSULTA,
  LARGO_MAXIMO_OBSERVACIONES,
  sumarDias,
  validarAtencion,
  validarFechaAgenda,
} from "../src/lib/atencion/validar.ts";

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

// ============ HU-12: fecha de la agenda ============

test("hoyArgentina usa la hora de Argentina, no la del servidor (UTC)", () => {
  // 24/09 a las 23:30 en Argentina = 25/09 02:30 UTC: sigue siendo 24/09.
  assert.equal(hoyArgentina(new Date("2026-09-25T02:30:00Z")), "2026-09-24");
  // 25/09 a las 00:10 en Argentina.
  assert.equal(hoyArgentina(new Date("2026-09-25T03:10:00Z")), "2026-09-25");
});

test("sumarDias cruza meses y años", () => {
  assert.equal(sumarDias("2026-09-30", 1), "2026-10-01");
  assert.equal(sumarDias("2026-01-01", -1), "2025-12-31");
  assert.equal(sumarDias("2028-02-28", 1), "2028-02-29");
});

test("validarFechaAgenda rechaza vacío, formato y fechas inexistentes", () => {
  assert.equal(validarFechaAgenda(""), "Elegí una fecha");
  assert.equal(validarFechaAgenda("24/09/2026"), "La fecha no es válida");
  assert.equal(validarFechaAgenda("2026-02-30"), "La fecha no es válida");
  assert.equal(validarFechaAgenda("hoy"), "La fecha no es válida");
  assert.equal(validarFechaAgenda("2026-09-24"), null);
  assert.equal(esFechaValida("2026-13-01"), false);
});

test("calcularEdad cuenta el cumpleaños y tolera datos faltantes", () => {
  assert.equal(calcularEdad("1990-09-24", "2026-09-24"), 36);
  assert.equal(calcularEdad("1990-09-25", "2026-09-24"), 35);
  assert.equal(calcularEdad(null, "2026-09-24"), null);
  assert.equal(calcularEdad("1990-09-24T00:00:00", "2026-09-24"), 36);
  assert.equal(calcularEdad("no", "2026-09-24"), null);
});

// ============ HU-13: validación de la atención ============

test("CA1: observaciones obligatorias", () => {
  assert.equal(
    validarAtencion({ idTurno: uuid, observaciones: "", motivo: "" }),
    "Tenés que escribir las observaciones de la atención"
  );
  assert.equal(
    validarAtencion({ idTurno: uuid, observaciones: "   \n ", motivo: "Control" }),
    "Tenés que escribir las observaciones de la atención"
  );
  assert.equal(
    validarAtencion({ idTurno: uuid, observaciones: "Evoluciona bien", motivo: "" }),
    null
  );
});

test("límites de largo (iguales a los check de la tabla atencion)", () => {
  assert.equal(LARGO_MAXIMO_OBSERVACIONES, 2000);
  assert.equal(LARGO_MAXIMO_MOTIVO_CONSULTA, 200);
  assert.equal(
    validarAtencion({ idTurno: uuid, observaciones: "x".repeat(2001), motivo: "" }),
    "Las observaciones no pueden superar los 2000 caracteres"
  );
  assert.equal(
    validarAtencion({ idTurno: uuid, observaciones: "x".repeat(2000), motivo: "" }),
    null
  );
  assert.equal(
    validarAtencion({ idTurno: uuid, observaciones: "ok", motivo: "m".repeat(201) }),
    "El motivo de consulta no puede superar los 200 caracteres"
  );
  assert.equal(
    validarAtencion({ idTurno: uuid, observaciones: "ok", motivo: "m".repeat(200) }),
    null
  );
});

test("CA3 (Should): el motivo es opcional pero se acepta", () => {
  assert.equal(
    validarAtencion({ idTurno: uuid, observaciones: "Sesión 3", motivo: "Control" }),
    null
  );
});

test("rechaza un id de turno manipulado", () => {
  for (const idTurno of ["", "abc", "1; drop table turno", `${uuid}x`]) {
    assert.equal(
      validarAtencion({ idTurno, observaciones: "ok", motivo: "" }),
      "Turno inválido",
      idTurno
    );
  }
});

// ============ Seguridad: chequeos sobre el código ============

const leer = (...partes) => readFileSync(join(...partes), "utf8");

test("HU-12: la agenda propia toma el profesional de la sesión, no del request", () => {
  const actions = leer("src", "lib", "atencion", "actions.ts");
  assert.match(actions, /p_id_profesional: usuario\.id_usuario/);
  assert.doesNotMatch(actions, /formData\.get\("id_profesional"\)/);
  assert.doesNotMatch(actions, /\.from\(/);
});

test("migración 010: la base exige turno propio y bloquea el doble registro", () => {
  const sql = leer("supabase", "migrations", "010_hu12_hu13_atencion.sql");

  // Profesional dueño del turno (auth.uid()) en registrar, editar y ver.
  assert.match(sql, /t\.id_profesional = auth\.uid\(\)/);
  const registrar = sql.slice(sql.indexOf("function public.fn_registrar_atencion"));
  assert.match(registrar, /perform public\.fn_exigir_turno_propio\(p_id_turno\)/);
  const editar = sql.slice(sql.indexOf("function public.fn_editar_atencion"));
  assert.match(editar, /perform public\.fn_exigir_turno_propio\(p_id_turno\)/);

  // Agenda: un Profesional solo la suya.
  assert.match(sql, /p_id_profesional is distinct from auth\.uid\(\)/);

  // Una atención por turno + tablas cerradas (solo por fn_*).
  assert.match(sql, /constraint atencion_un_registro_por_turno unique \(id_turno\)/);
  assert.match(sql, /alter table public\.atencion enable row level security/);
  assert.match(sql, /revoke all on public\.atencion from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.fn_exigir_turno_propio\(uuid\) from public, anon, authenticated/);

  // Estado nuevo y el horario atendido sigue ocupado.
  assert.match(sql, /'confirmado', 'cancelado', 'ausente', 'atendido'/);
  assert.match(sql, /where \(estado in \('confirmado', 'atendido'\)\)/);
});
