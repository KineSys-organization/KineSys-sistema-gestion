import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  diasEntre,
  formatearFechaCorta,
  periodoPorDefecto,
  periodosRapidos,
  validarPeriodo,
} from "../src/lib/indicadores/validar.ts";

test("exige desde y hasta", () => {
  assert.equal(validarPeriodo({ desde: "", hasta: "2026-09-30" }), "Elegí el período (desde y hasta)");
  assert.equal(validarPeriodo({ desde: "2026-09-01", hasta: " " }), "Elegí el período (desde y hasta)");
});

test("rechaza fechas inválidas y desde posterior a hasta", () => {
  assert.equal(validarPeriodo({ desde: "2026-02-30", hasta: "2026-03-01" }), "La fecha desde no es válida");
  assert.equal(validarPeriodo({ desde: "2026-09-01", hasta: "30/09/2026" }), "La fecha hasta no es válida");
  assert.equal(
    validarPeriodo({ desde: "2026-09-30", hasta: "2026-09-01" }),
    "La fecha desde no puede ser posterior a la fecha hasta"
  );
});

test("acepta un día solo y hasta un año, no más", () => {
  assert.equal(validarPeriodo({ desde: "2026-09-28", hasta: "2026-09-28" }), null);
  assert.equal(validarPeriodo({ desde: "2025-09-28", hasta: "2026-09-28" }), null);
  assert.equal(
    validarPeriodo({ desde: "2025-01-01", hasta: "2026-09-28" }),
    "El período no puede superar un año"
  );
  assert.equal(diasEntre("2026-09-01", "2026-09-30"), 29);
});

test("por defecto abre el mes actual completo", () => {
  assert.deepEqual(periodoPorDefecto("2026-09-28"), { desde: "2026-09-01", hasta: "2026-09-30" });
  assert.deepEqual(periodoPorDefecto("2024-02-10"), { desde: "2024-02-01", hasta: "2024-02-29" });
});

test("atajos: últimos 7 días, este mes y mes anterior (cruza el año)", () => {
  const [siete, esteMes, anterior] = periodosRapidos("2026-01-05");
  assert.deepEqual(siete.periodo, { desde: "2025-12-30", hasta: "2026-01-05" });
  assert.deepEqual(esteMes.periodo, { desde: "2026-01-01", hasta: "2026-01-31" });
  assert.deepEqual(anterior.periodo, { desde: "2025-12-01", hasta: "2025-12-31" });
});

test("formato corto de la fecha del período", () => {
  assert.equal(formatearFechaCorta("2026-09-01"), "01/09/2026");
});

test("vista corta: sin ocupación ni desglose por profesional (son de HU-18)", () => {
  const pagina = readFileSync("src/app/(main)/indicadores/page.tsx", "utf8");
  const migracion = readFileSync("supabase/migrations/013_hu26_indicadores_generales.sql", "utf8");
  for (const codigo of [pagina, migracion]) {
    assert.doesNotMatch(codigo, /ocupaci[oó]n'|minutos_|franja_profesional|profesionales\./i);
  }
  for (const estado of ["Confirmados", "Atendidos", "Cancelados", "Ausentes", "Pacientes nuevos"]) {
    assert.match(pagina, new RegExp(estado));
  }
});

test("la pantalla es solo del Gerente y la action chequea el rol antes de consultar", () => {
  const pagina = readFileSync("src/app/(main)/indicadores/page.tsx", "utf8");
  assert.match(pagina, /await exigirGerente\(\)/);

  const action = readFileSync("src/lib/indicadores/actions.ts", "utf8");
  const chequeo = action.indexOf('exigirAccion("indicadores.consultar")');
  const rpc = action.indexOf('rpc("fn_consultar_indicadores_generales"');
  assert.ok(chequeo > 0 && rpc > chequeo, "exigirAccion va antes de la RPC");
  assert.doesNotMatch(action, /\.from\(/);
});
