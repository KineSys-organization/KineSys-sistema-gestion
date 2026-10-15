import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { puedeHacer } from "../src/lib/auth/permisos.ts";
import { leerFiltrosTurnos, urlTurnos } from "../src/lib/turnos/busqueda.ts";
import {
  esPrioridad,
  etiquetaPrioridad,
  leerPrioridad,
  muestraMarcaPrioridad,
  PRIORIDAD_POR_DEFECTO,
  PRIORIDADES,
  validarCambioPrioridad,
} from "../src/lib/turnos/prioridad.ts";

// HU-20. Prioridad o urgencia del turno (issue #20).

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

test("tres valores, Normal por defecto", () => {
  assert.deepEqual(
    PRIORIDADES.map((p) => p.valor),
    ["normal", "alta", "urgente"]
  );
  assert.equal(PRIORIDAD_POR_DEFECTO, "normal");
  assert.equal(leerPrioridad(undefined), "normal");
  assert.equal(leerPrioridad("URGENTE"), "urgente");
  assert.equal(leerPrioridad("altísima"), "normal");
  assert.equal(esPrioridad("alta"), true);
  assert.equal(esPrioridad("x"), false);
  assert.equal(etiquetaPrioridad("urgente"), "Urgente");
});

test("Normal no lleva marca; Alta y Urgente sí", () => {
  assert.equal(muestraMarcaPrioridad("normal"), false);
  assert.equal(muestraMarcaPrioridad(null), false);
  assert.equal(muestraMarcaPrioridad("alta"), true);
  assert.equal(muestraMarcaPrioridad("urgente"), true);
});

test("validar el cambio de prioridad (mismos mensajes que la base)", () => {
  const base = { idTurno: uuid, prioridad: "alta", nota: "" };
  assert.equal(validarCambioPrioridad(base), null);
  assert.equal(validarCambioPrioridad({ ...base, idTurno: "x" }), "Turno inválido");
  assert.equal(validarCambioPrioridad({ ...base, prioridad: "" }), "Elegí la prioridad");
  assert.equal(validarCambioPrioridad({ ...base, prioridad: "muy alta" }), "La prioridad no es válida");
  assert.equal(validarCambioPrioridad({ ...base, nota: "n".repeat(200) }), null);
  assert.equal(
    validarCambioPrioridad({ ...base, nota: "n".repeat(201) }),
    "La nota no puede superar los 200 caracteres"
  );
});

test("filtro Prioridad del listado (HU-09): en la URL y combinable", () => {
  const f = leerFiltrosTurnos({ desde: "", hasta: "", prioridad: "urgente", estado: "confirmado" }, "2026-10-15");
  assert.equal(f.prioridad, "urgente");
  assert.equal(f.estado, "confirmado");
  assert.match(urlTurnos(f), /prioridad=urgente/);
  assert.match(urlTurnos(f), /estado=confirmado/);
  // Desconocida o vacía = Todas.
  assert.equal(leerFiltrosTurnos({ prioridad: "x" }, "2026-10-15").prioridad, null);
  assert.equal(leerFiltrosTurnos({}, "2026-10-15").prioridad, null);
});

test("solo Recepción y Gerente la cambian; el Profesional solo la ve", () => {
  assert.equal(puedeHacer("Gerente", "turnos.prioridad"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "turnos.prioridad"), true);
  assert.equal(puedeHacer("Profesional", "turnos.prioridad"), false);
});

const leer = (...partes) => readFileSync(join(...partes), "utf8");

test("migración 027: columna, drop + create y la prioridad en cada consulta", () => {
  const sql = leer("supabase", "migrations", "027_hu20_prioridad_turno.sql");
  assert.match(sql, /add column if not exists prioridad text not null default 'normal'/);
  assert.match(sql, /check \(prioridad in \('normal', 'alta', 'urgente'\)\)/);
  assert.match(sql, /drop function if exists public\.fn_otorgar_turno\(uuid, uuid, uuid, date, time, uuid\);/);
  // Sobre la versión de HU-17 (8 parámetros, el último p_estado_cobro): queda una sola de 9.
  assert.match(sql, /drop function if exists public\.fn_buscar_turnos\(text, uuid, uuid, date, date, text, integer, text\);/);
  assert.match(sql, /p_estado_cobro text default null,\r?\n\s+p_prioridad text default null/);
  assert.match(sql, /grant execute on function public\.fn_buscar_turnos\(text, uuid, uuid, date, date, text, integer, text, text\) to authenticated/);
  // No se pierde lo de HU-17 (estado de cobro) ni lo de HU-38 (orden con sesiones).
  assert.match(sql, /'estado_cobro'/);
  assert.match(sql, /'orden_sesiones', a\.orden_sesiones/);
  // Cambiar: rol con usuario activo, confirmado y no empezado.
  const cambiar = sql.slice(sql.indexOf("function public.fn_cambiar_prioridad_turno"));
  assert.match(cambiar, /fn_exigir_rol\(array\['Gerente', 'Mesa de Entradas'\]\)/);
  assert.match(cambiar, /v_turno\.estado <> 'confirmado'/);
  // La repetición (HU-25) copia la prioridad del original.
  assert.match(sql, /v_actual\.prioridad, -- HU-20/);
  // Disponibilidad y orden no se tocan.
  assert.doesNotMatch(sql, /function public\.fn_consultar_disponibilidad/);
  assert.match(sql, /order by t\.hora_inicio, \(t\.estado = 'cancelado'\), t\.creado/);
});

test("las actions mandan la prioridad por rpc", () => {
  const actions = leer("src", "lib", "turnos", "actions.ts");
  assert.match(actions, /p_prioridad: prioridad,/);
  assert.match(actions, /rpc\("fn_cambiar_prioridad_turno"/);
  assert.match(actions, /exigirAccion\("turnos\.prioridad"\)/);
  assert.match(actions, /p_prioridad: filtros\.prioridad/);
  assert.doesNotMatch(actions, /\.from\(/);
});
