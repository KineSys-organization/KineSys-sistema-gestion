import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { puedeAcceder, puedeHacer } from "../src/lib/auth/permisos.ts";
import {
  hayFiltrosOrdenes,
  leerFiltrosOrdenes,
  mensajeSinOrdenes,
  MENSAJE_RANGO_ORDENES,
  urlOrdenes,
  validarFiltrosOrdenes,
} from "../src/lib/ordenes/validar.ts";

// HU-24B. Historial de órdenes médicas del paciente (issue #45).

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

test("permisos: Gerente y Profesional sí, Mesa de Entradas no", () => {
  assert.equal(puedeHacer("Gerente", "ordenes.consultar"), true);
  assert.equal(puedeHacer("Profesional", "ordenes.consultar"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "ordenes.consultar"), false);
  // El Profesional entra por su agenda (no por /pacientes, que es de Recepción).
  assert.equal(puedeAcceder("Profesional", `/mi-agenda/${uuid}/ordenes`), true);
  assert.equal(puedeAcceder("Profesional", `/pacientes/${uuid}`), false);
  assert.equal(puedeAcceder("Mesa de Entradas", `/mi-agenda/${uuid}/ordenes`), false);
});

test("filtros desde la URL: lo inválido se ignora", () => {
  assert.deepEqual(leerFiltrosOrdenes({}), { desde: "", hasta: "", profesional: "" });
  assert.deepEqual(
    leerFiltrosOrdenes({ desde: "2026-10-01", hasta: "2026-02-30", profesional: "x" }),
    { desde: "2026-10-01", hasta: "", profesional: "" }
  );
  assert.deepEqual(leerFiltrosOrdenes({ profesional: uuid }), {
    desde: "",
    hasta: "",
    profesional: uuid,
  });
});

test("rango: Desde no posterior a Hasta", () => {
  assert.equal(
    validarFiltrosOrdenes({ desde: "2026-10-10", hasta: "2026-10-01", profesional: "" }),
    MENSAJE_RANGO_ORDENES
  );
  assert.equal(validarFiltrosOrdenes({ desde: "2026-10-01", hasta: "2026-10-01", profesional: "" }), null);
  assert.equal(validarFiltrosOrdenes({ desde: "", hasta: "2026-10-01", profesional: "" }), null);
});

test("URL de filtros y Limpiar filtros", () => {
  const vacios = { desde: "", hasta: "", profesional: "" };
  assert.equal(urlOrdenes("/pacientes/abc", vacios), "/pacientes/abc");
  assert.equal(hayFiltrosOrdenes(vacios), false);
  const f = { desde: "2026-10-01", hasta: "", profesional: uuid };
  assert.equal(urlOrdenes("/pacientes/abc", f), `/pacientes/abc?desde=2026-10-01&profesional=${uuid}`);
  assert.equal(hayFiltrosOrdenes(f), true);
});

test("lista vacía: no es un error y distingue sin órdenes de sin resultados", () => {
  assert.equal(mensajeSinOrdenes(0), "Este paciente no tiene órdenes médicas registradas");
  assert.equal(mensajeSinOrdenes(3), "No hay órdenes para esos filtros");
});

const leer = (...partes) => readFileSync(join(...partes), "utf8");

test("migración 026: roles, paciente propio y sin datos clínicos", () => {
  const sql = leer("supabase", "migrations", "026_hu24b_historial_ordenes.sql");
  assert.match(sql, /fn_exigir_rol\(array\['Gerente', 'Profesional'\]\)/);
  assert.match(sql, /perform public\.fn_exigir_paciente_propio\(p_id_paciente\)/);
  assert.match(sql, /a\.orden_medica is not null/);
  assert.match(sql, /order by t\.fecha desc, t\.hora_inicio desc/);
  assert.doesNotMatch(sql, /'observaciones'|'motivo_consulta'/);
  assert.match(sql, /grant execute on function public\.fn_listar_ordenes_paciente\(uuid, date, date, uuid\) to authenticated/);
});

test("el front pide el historial solo por rpc y el id del profesional no sale del request", () => {
  const actions = leer("src", "lib", "ordenes", "actions.ts");
  assert.match(actions, /rpc\("fn_listar_ordenes_paciente"/);
  assert.match(actions, /exigirAccion\("ordenes\.consultar"\)/);
  assert.doesNotMatch(actions, /\.from\(/);
  // p_id_profesional es solo el filtro "Profesional"; el acceso lo decide auth.uid() en la base.
  const pagina = leer("src", "app", "(main)", "mi-agenda", "[id]", "ordenes", "page.tsx");
  assert.match(pagina, /listarOrdenesPaciente\(\s*turno\.id_paciente/);
  const ficha = leer("src", "app", "(main)", "pacientes", "[id]", "page.tsx");
  assert.match(ficha, /puedeHacer\(usuario\.rol_usuario, "ordenes\.consultar"\)/);
});
