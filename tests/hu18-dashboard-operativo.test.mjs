import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pagina = readFileSync("src/app/(main)/indicadores/operativo/page.tsx", "utf8");
const paginaCorta = readFileSync("src/app/(main)/indicadores/page.tsx", "utf8");
const action = readFileSync("src/lib/indicadores/actions.ts", "utf8");
const migracion = readFileSync("supabase/migrations/20261013043429_hu18_dashboard_operativo.sql", "utf8");
const pruebaSql = readFileSync("supabase/tests/hu18_dashboard_operativo.sql", "utf8");

test("HU-18 agrega una vista operativa separada y conserva el período elegido en HU-26", () => {
  assert.match(paginaCorta, /Ver dashboard operativo/);
  assert.match(paginaCorta, /\/indicadores\/operativo\?desde=\$\{periodo\.desde\}&hasta=\$\{periodo\.hasta\}/);
  assert.match(pagina, /Volver a indicadores/);
  assert.match(pagina, /periodosRapidos\(hoy\)/);
});

test("HU-18 muestra pacientes, desglose por profesional y servicio, e indica Sin franjas", () => {
  for (const texto of ["Pacientes nuevos", "Pacientes recurrentes", "Turnos por profesional", "Turnos por servicio", "Sin franjas", "Inactivo · no computa"]) {
    assert.ok(pagina.includes(texto), `falta ${texto}`);
  }
  for (const estado of ["Confirmados", "Atendidos", "Cancelados", "Ausentes"]) {
    assert.ok(pagina.includes(estado), `falta ${estado}`);
  }
});

test("HU-18 es solo Gerente y consulta la RPC con fechas validadas", () => {
  assert.match(pagina, /await exigirGerente\(\)/);
  const inicio = action.indexOf("export async function obtenerDashboardOperativo");
  const cuerpo = action.slice(inicio);
  const chequeo = cuerpo.indexOf('exigirAccion("indicadores.consultar")');
  const validacion = cuerpo.indexOf("validarPeriodo(periodo)");
  const rpc = cuerpo.indexOf('rpc("fn_consultar_dashboard_operativo"');
  assert.ok(chequeo >= 0 && validacion > chequeo && rpc > validacion);
  assert.doesNotMatch(cuerpo, /\.from\(/);
  assert.match(migracion, /public\.fn_exigir_rol\(array\['Gerente'\]\)/);
  assert.match(migracion, /revoke all on function public\.fn_consultar_dashboard_operativo/);
  assert.match(migracion, /grant execute on function public\.fn_consultar_dashboard_operativo[\s\S]*to authenticated/);
});

test("la RPC usa ocupación real, contempla fines de semana y profesionales inactivos", () => {
  assert.match(migracion, /extract\(isodow from d\.fecha\)/);
  assert.match(migracion, /'confirmado', 'atendido', 'ausente'/);
  assert.match(migracion, /'sin_franjas'/);
  assert.match(migracion, /or coalesce\(tp\.total, 0\) > 0/);
  assert.match(pruebaSql, /2099/);
  assert.match(pruebaSql, /rollback;/i);
});
