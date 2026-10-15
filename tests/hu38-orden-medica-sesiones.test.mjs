import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  leerSesiones,
  SESIONES_MAXIMAS,
  SESIONES_MINIMAS,
  validarAtencion,
  validarOrden,
} from "../src/lib/atencion/validar.ts";
import { textoCobertura, textoSesiones, tituloOrden } from "../src/lib/atencion/orden.ts";

// HU-38. Orden médica con datos automáticos del paciente, sesiones y detalle (issue #72).

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";
const base = { idTurno: uuid, observaciones: "Sesión 1", motivo: "" };

// ============ Validación ============

test("la orden sigue siendo opcional: sin sesiones ni detalle no hay error", () => {
  assert.equal(validarAtencion({ ...base, orden: "", sesiones: "" }), null);
  assert.equal(validarAtencion({ ...base, orden: "   ", sesiones: "  " }), null);
  assert.equal(validarAtencion(base), null);
});

test("si se carga, van las dos cosas", () => {
  assert.equal(
    validarAtencion({ ...base, orden: "Lesión de rodilla", sesiones: "" }),
    "Indicá la cantidad de sesiones"
  );
  assert.equal(
    validarAtencion({ ...base, orden: "  ", sesiones: "10" }),
    "Completá el detalle de la orden"
  );
  assert.equal(
    validarAtencion({ ...base, orden: "Lesión de rodilla. Magnetoterapia", sesiones: "10" }),
    null
  );
});

test("sesiones: entero de 1 a 50", () => {
  assert.equal(SESIONES_MINIMAS, 1);
  assert.equal(SESIONES_MAXIMAS, 50);
  const orden = "Detalle";
  assert.equal(validarOrden({ ...base, orden, sesiones: "1" }), null);
  assert.equal(validarOrden({ ...base, orden, sesiones: "50" }), null);
  for (const malo of ["0", "51", "2.5", "-3", "diez"]) {
    assert.equal(
      validarOrden({ ...base, orden, sesiones: malo }),
      "La cantidad de sesiones tiene que ser entre 1 y 50",
      malo
    );
  }
});

test("leerSesiones: vacío = null, no entero = NaN", () => {
  assert.equal(leerSesiones(""), null);
  assert.equal(leerSesiones(undefined), null);
  assert.equal(leerSesiones(" 12 "), 12);
  assert.ok(Number.isNaN(leerSesiones("1,5")));
});

test("orden vieja (HU-24A) sin sesiones: se puede guardar si no se cambia el detalle", () => {
  const vieja = "Orden de HU-24A";
  assert.equal(validarOrden({ ...base, orden: vieja, sesiones: "", ordenVieja: vieja }), null);
  assert.equal(
    validarOrden({ ...base, orden: "Otro detalle", sesiones: "", ordenVieja: vieja }),
    "Indicá la cantidad de sesiones"
  );
  // También se le pueden agregar las sesiones o quitarla.
  assert.equal(validarOrden({ ...base, orden: vieja, sesiones: "8", ordenVieja: vieja }), null);
  assert.equal(validarOrden({ ...base, orden: "", sesiones: "", ordenVieja: vieja }), null);
});

// ============ Textos ============

test("textos de sesiones y cobertura", () => {
  assert.equal(textoSesiones(null), "No informadas");
  assert.equal(textoSesiones(1), "1 sesión");
  assert.equal(textoSesiones(10), "10 sesiones");
  assert.equal(textoCobertura(null), "Particular");
  assert.equal(textoCobertura("Particular", "123"), "Particular");
  assert.equal(textoCobertura("OSDE", "123"), "OSDE · nº 123");
  assert.equal(textoCobertura("OSDE", null), "OSDE");
  assert.equal(
    tituloOrden({ apellidoPaciente: "Pérez", nombrePaciente: "Ana", fechaTurno: "2026-10-15" }),
    "Orden médica - Pérez, Ana - 2026-10-15"
  );
});

// ============ Chequeos sobre el código ============

const leer = (...partes) => readFileSync(join(...partes), "utf8");

test("las actions mandan p_orden_sesiones y no mandan datos del paciente", () => {
  const actions = leer("src", "lib", "atencion", "actions.ts");
  assert.match(actions, /p_orden_sesiones: leerSesiones\(campos\.sesiones\)/);
  assert.doesNotMatch(actions, /p_(dni|nombre|apellido|cobertura|obra)/);
  assert.doesNotMatch(actions, /\.from\(/);
});

test("migración 025: columna, checks, drop + create y datos dentro de atencion", () => {
  const sql = leer("supabase", "migrations", "025_hu38_orden_medica_sesiones.sql");

  assert.match(sql, /add column orden_sesiones smallint;/);
  assert.match(sql, /check \(orden_sesiones is null or orden_sesiones between 1 and 50\)/);
  assert.match(sql, /check \(orden_sesiones is null or orden_medica is not null\)/);

  assert.match(sql, /drop function if exists public\.fn_registrar_atencion\(uuid, text, text, text\);/);
  assert.match(sql, /drop function if exists public\.fn_editar_atencion\(uuid, text, text, text\);/);
  assert.match(sql, /grant execute on function public\.fn_registrar_atencion\(uuid, text, text, text, integer\) to authenticated/);
  assert.match(sql, /grant execute on function public\.fn_editar_atencion\(uuid, text, text, text, integer\) to authenticated/);

  for (const fn of ["fn_registrar_atencion(", "fn_editar_atencion("]) {
    const cuerpo = sql.slice(sql.indexOf(`create function public.${fn}`));
    assert.match(cuerpo, /perform public\.fn_exigir_turno_propio\(p_id_turno\)/, fn);
    assert.match(cuerpo, /'Indicá la cantidad de sesiones'/, fn);
    assert.match(cuerpo, /'Completá el detalle de la orden'/, fn);
  }

  // Sesiones y cobertura solo dentro de 'atencion' (profesional que atendió).
  const obtener = sql.slice(sql.indexOf("function public.fn_obtener_turno"));
  const rama = obtener.slice(
    obtener.indexOf("'atencion', case"),
    obtener.indexOf("else null", obtener.indexOf("'atencion', case"))
  );
  assert.match(rama, /a\.id_profesional = auth\.uid\(\)/);
  assert.match(rama, /'orden_sesiones', a\.orden_sesiones/);
  assert.match(rama, /'orden_cobertura'/);
  assert.equal(obtener.match(/'orden_sesiones'/g)?.length, 1);
});

test("la orden se imprime con el mecanismo de HU-27 (sin librerías nuevas)", () => {
  const orden = leer("src", "components", "atencion", "OrdenMedica.tsx");
  assert.match(orden, /solo-impresion bloque-impresion orden-impresion/);
  assert.match(orden, /logo-kinesys\.svg/);
  const boton = leer("src", "components", "atencion", "ImprimirOrdenButton.tsx");
  assert.match(boton, /window\.print\(\)/);
  const pkg = JSON.parse(leer("package.json"));
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    assert.doesNotMatch(dep, /pdf|print/i);
  }
});
