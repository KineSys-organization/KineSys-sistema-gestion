import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  cantidadConTexto,
  leerFiltrosHistorial,
  MENSAJE_RANGO_INVALIDO,
  MENSAJE_SIN_RESULTADOS,
  MENSAJE_SIN_TURNOS,
  totalPaginas,
  urlHistorial,
  validarFiltrosHistorial,
} from "../src/lib/historial/validar.ts";
import { puedeHacer } from "../src/lib/auth/permisos.ts";

const migracion = readFileSync("supabase/migrations/034_hu16_historial_paciente.sql", "utf8");
const pruebaSql = readFileSync("supabase/tests/hu16_historial_paciente.sql", "utf8");
const paginaPaciente = readFileSync("src/app/(main)/pacientes/[id]/page.tsx", "utf8");
const paginaHistoria = readFileSync("src/app/(main)/historia-clinica/[paciente]/page.tsx", "utf8");
const action = readFileSync("src/lib/historial/actions.ts", "utf8");
const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

test("la migración define fn_consultar_historial_paciente con rol y sin grants abiertos", () => {
  assert.match(migracion, /fn_consultar_historial_paciente/);
  assert.match(migracion, /fn_es_recepcion|fn_exigir_paciente_propio/);
  assert.match(migracion, /fn_estado_cobro/);
  assert.match(migracion, /security definer/);
  assert.match(migracion, /set search_path = ''/);
  assert.match(migracion, /revoke all on function public\.fn_consultar_historial_paciente/);
  assert.match(migracion, /grant execute on function public\.fn_consultar_historial_paciente/);
});

test("filtros: sin params = sin límite de fechas, página 1", () => {
  assert.deepEqual(leerFiltrosHistorial({}), {
    desde: null,
    hasta: null,
    profesional: null,
    pagina: 1,
  });
});

test("filtros prefijados (ficha del paciente) leen hdesde/hhasta/hprofesional/hpagina", () => {
  assert.deepEqual(
    leerFiltrosHistorial(
      { hdesde: "2026-01-01", hhasta: "2026-01-31", hprofesional: uuid, hpagina: "2" },
      true
    ),
    { desde: "2026-01-01", hasta: "2026-01-31", profesional: uuid, pagina: 2 }
  );
  // Sin prefijo en modo prefijado no cuentan.
  assert.equal(leerFiltrosHistorial({ desde: "2026-01-01" }, true).desde, null);
});

test("filtros sin prefijo (historia clínica) leen desde/hasta/profesional/pagina", () => {
  assert.deepEqual(
    leerFiltrosHistorial({ desde: "2026-02-01", hasta: "2026-02-28", profesional: uuid, pagina: "3" }),
    { desde: "2026-02-01", hasta: "2026-02-28", profesional: uuid, pagina: 3 }
  );
});

test("rango inválido se rechaza; mensajes de vacío", () => {
  assert.equal(
    validarFiltrosHistorial({ desde: "2026-02-10", hasta: "2026-02-01", profesional: null, pagina: 1 }),
    MENSAJE_RANGO_INVALIDO
  );
  assert.equal(MENSAJE_SIN_TURNOS, "Este paciente todavía no tiene turnos");
  assert.equal(MENSAJE_SIN_RESULTADOS, "No hay turnos para esos filtros");
});

test("url y paginación: 10 por página, conserva filtros", () => {
  assert.equal(totalPaginas(0), 1);
  assert.equal(totalPaginas(10), 1);
  assert.equal(totalPaginas(11), 2);
  const url = urlHistorial("/pacientes/abc", {
    desde: "2026-01-01",
    hasta: "2026-01-31",
    profesional: uuid,
    pagina: 2,
  }, { prefijados: true, ancla: "#historial" });
  assert.match(url, /hdesde=2026-01-01/);
  assert.match(url, /hpagina=2/);
  assert.match(url, /#historial$/);
});

test("HU-08: historial.consultar lo pueden los tres roles de gestión", () => {
  assert.equal(puedeHacer("Gerente", "historial.consultar"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "historial.consultar"), true);
  assert.equal(puedeHacer("Profesional", "historial.consultar"), true);
  assert.equal(puedeHacer("Paciente", "historial.consultar"), false);
});

test("el front no usa supabase.from y exige la acción antes de la RPC", () => {
  assert.doesNotMatch(action, /\.from\(/);
  assert.match(action, /exigirAccion\("historial\.consultar"\)/);
  assert.match(action, /fn_consultar_historial_paciente/);
  assert.match(paginaPaciente, /HistorialPaciente/);
  assert.match(paginaPaciente, /consultarHistorialPaciente/);
  assert.match(paginaHistoria, /titulo="Evolución"/);
  assert.match(paginaHistoria, /verAtencion/);
  assert.match(pruebaSql, /fn_consultar_historial_paciente/);
  assert.match(pruebaSql, /rollback/);
});

test("el resumen usa singular con 1 y plural con el resto", () => {
  assert.equal(cantidadConTexto(1, "turno", "turnos"), "turno");
  assert.equal(cantidadConTexto(0, "turno", "turnos"), "turnos");
  assert.equal(cantidadConTexto(27, "atendido", "atendidos"), "atendidos");
});

test("con rango inválido la action igual trae los profesionales y no devuelve turnos", () => {
  assert.match(action, /p_desde: errorFiltros \? null/);
  assert.match(action, /turnos: \[\] \}, error: errorFiltros/);
});
