import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  claseCobro,
  ESTADOS_COBRO,
  esEstadoCobro,
  etiquetaCobro,
} from "../src/lib/pagos/cobro.ts";
import {
  ATAJOS_PERIODO,
  atajoActual,
  leerFiltrosTurnos,
  URL_PENDIENTES_COBRO,
  urlAtajoPeriodo,
  urlTurnos,
} from "../src/lib/turnos/busqueda.ts";

// HU-17. Estado de cobro de cada turno.
const HOY = "2026-10-14";
const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

test("estados: los 4 de la issue, con texto (no solo color)", () => {
  assert.deepEqual(
    ESTADOS_COBRO.map((e) => [e.valor, e.etiqueta]),
    [
      ["pendiente", "Pendiente de pago"],
      ["pagado", "Pagado"],
      ["reembolsado", "Reembolsado"],
      ["no_corresponde", "No corresponde cobro"],
    ]
  );
  assert.equal(etiquetaCobro("pagado"), "Pagado");
  assert.equal(etiquetaCobro("parcial"), "—", "Parcial no es parte del alcance");
  assert.equal(esEstadoCobro(null), false, "Al Profesional le llega null: no se muestra");
  // Cada estado tiene su color, y Pendiente se distingue de Reembolsado.
  assert.notEqual(claseCobro("pendiente"), claseCobro("reembolsado"));
  assert.equal(new Set(ESTADOS_COBRO.map((e) => e.clase)).size, 4);
});

test("filtro Estado de cobro: se lee de la URL, ignora valores raros y se conserva al paginar", () => {
  assert.equal(leerFiltrosTurnos({}, HOY).cobro, null, "Sin filtro = Todos");
  assert.equal(leerFiltrosTurnos({ cobro: "pendiente" }, HOY).cobro, "pendiente");
  assert.equal(leerFiltrosTurnos({ cobro: "parcial" }, HOY).cobro, null);
  assert.equal(leerFiltrosTurnos({ cobro: "" }, HOY).cobro, null);

  // Combinable con los demás filtros y se conserva al paginar.
  const filtros = leerFiltrosTurnos(
    { q: "ana", profesional: uuid, desde: "", hasta: "", estado: "cancelado", cobro: "pagado" },
    HOY
  );
  const url = new URL(urlTurnos(filtros, 2), "http://x");
  assert.equal(url.searchParams.get("cobro"), "pagado");
  assert.equal(url.searchParams.get("estado"), "cancelado");
  assert.equal(url.searchParams.get("pagina"), "2");
  const releidos = leerFiltrosTurnos(Object.fromEntries(url.searchParams), HOY);
  assert.deepEqual(releidos, { ...filtros, pagina: 2 });
});

test("atajo de /pagos: todos los pendientes, sin límite de fechas", () => {
  const filtros = leerFiltrosTurnos(
    Object.fromEntries(new URL(URL_PENDIENTES_COBRO, "http://x").searchParams),
    HOY
  );
  assert.equal(filtros.cobro, "pendiente");
  assert.equal(filtros.desde, null);
  assert.equal(filtros.hasta, null);
  assert.equal(atajoActual(filtros, HOY), "todos");
});

test("atajos de período: Todos, Hasta hoy y Próximos (conservan el resto y vuelven a la página 1)", () => {
  assert.deepEqual(ATAJOS_PERIODO.map((a) => a.etiqueta), ["Todos", "Hasta hoy", "Próximos"]);
  const filtros = { ...leerFiltrosTurnos({ cobro: "pendiente", profesional: uuid, desde: "", hasta: "" }, HOY), pagina: 3 };

  const hastaHoy = leerFiltrosTurnos(
    Object.fromEntries(new URL(urlAtajoPeriodo(filtros, "hasta_hoy", HOY), "http://x").searchParams),
    HOY
  );
  assert.equal(hastaHoy.desde, null);
  assert.equal(hastaHoy.hasta, HOY);
  assert.equal(hastaHoy.cobro, "pendiente");
  assert.equal(hastaHoy.profesional, uuid);
  assert.equal(hastaHoy.pagina, 1);
  assert.equal(atajoActual(hastaHoy, HOY), "hasta_hoy");

  const proximos = leerFiltrosTurnos(
    Object.fromEntries(new URL(urlAtajoPeriodo(filtros, "proximos", HOY), "http://x").searchParams),
    HOY
  );
  assert.equal(proximos.desde, HOY);
  assert.equal(proximos.hasta, null);
  assert.equal(atajoActual(proximos, HOY), "proximos");

  // Un rango escrito a mano no marca ningún atajo.
  assert.equal(atajoActual({ ...filtros, desde: "2026-10-01", hasta: "2026-10-31" }, HOY), null);
});

// --- Chequeos sobre la migración 024 y las pantallas ---

const sql = readFileSync("supabase/migrations/024_hu17_estado_cobro.sql", "utf8");
const leer = (ruta) => readFileSync(ruta, "utf8");

test("migración 024: una sola regla, reutilizada en las 4 funciones", () => {
  assert.match(sql, /function public\.fn_estado_cobro\(/);
  for (const fn of ["fn_obtener_turno", "fn_consultar_agenda_profesional", "fn_buscar_turnos", "fn_obtener_pago"]) {
    assert.match(sql, new RegExp(`function public\\.${fn}\\(`), fn);
  }
  // La regla se usa en las 4 (el detalle y la agenda la envuelven en "solo Recepción").
  assert.ok((sql.match(/public\.fn_estado_cobro\(/g) ?? []).length >= 5);
  // No se guarda: sin tablas nuevas ni cambios de datos.
  assert.doesNotMatch(sql, /create table|alter table|insert into|update public\./i);
  // No quedan dos versiones de fn_buscar_turnos.
  assert.match(sql, /drop function if exists public\.fn_buscar_turnos\(text, uuid, uuid, date, date, text, integer\)/);
  // La regla es interna.
  assert.match(sql, /revoke all on function public\.fn_estado_cobro\(text, boolean, boolean\)\s+from public, anon, authenticated/);
});

test("migración 024: el Profesional no recibe el estado de cobro", () => {
  // Detalle y agenda: solo si es Recepción; si no, null.
  assert.equal((sql.match(/when v_es_recepcion then\s+public\.fn_estado_cobro/g) ?? []).length, 2);
});

test("pantallas: columna y filtro en /turnos, detalle, agenda y atajo en /pagos", () => {
  const turnos = leer("src/app/(main)/turnos/page.tsx");
  assert.match(turnos, /<th>Cobro<\/th>/);
  assert.match(turnos, /name="cobro"/);
  assert.match(turnos, /EstadoCobroBadge estado=\{turno\.estado_cobro\}/);

  assert.match(leer("src/app/(main)/turnos/[id]/page.tsx"), /Estado de cobro: <EstadoCobroBadge/);
  assert.match(leer("src/app/(main)/agenda/page.tsx"), /EstadoCobroBadge estado=\{turno\.estado_cobro\}/);
  assert.match(leer("src/app/(main)/pagos/page.tsx"), /href=\{URL_PENDIENTES_COBRO\}/);

  // El Profesional no lo ve en Mi agenda.
  for (const archivo of ["src/app/(main)/mi-agenda/page.tsx", "src/app/(main)/mi-agenda/[id]/page.tsx"]) {
    assert.doesNotMatch(leer(archivo), /estado_cobro|EstadoCobroBadge/, archivo);
  }
});
