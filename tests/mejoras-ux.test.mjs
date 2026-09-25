import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  armarSemanas,
  diaSeleccionado,
  urlDisponibilidad,
} from "../src/lib/disponibilidad/calendario.ts";
import {
  leerFiltrosPacientes,
  OBRA_PARTICULAR,
  urlVolverTurno,
} from "../src/lib/pacientes/validar.ts";

const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";

// 31 días desde el jueves 24/09/2026.
function ventana(libresPorDia = () => 0) {
  const dias = [];
  const inicio = new Date("2026-09-24T00:00:00Z");
  for (let i = 0; i < 31; i++) {
    const d = new Date(inicio);
    d.setUTCDate(inicio.getUTCDate() + i);
    dias.push({ fecha: d.toISOString().slice(0, 10), libres: libresPorDia(i) });
  }
  return dias;
}

test("calendario: semanas de lunes a domingo con huecos antes y después", () => {
  const semanas = armarSemanas(ventana());
  assert.ok(semanas.every((s) => s.length === 7));
  // 24/09/2026 es jueves: lunes a miércoles vacíos.
  assert.deepEqual(semanas[0].slice(0, 3), [null, null, null]);
  assert.equal(semanas[0][3].fecha, "2026-09-24");
  assert.equal(semanas[0][3].esPrimeroDelMes, true);
  // El 1 de octubre muestra el mes.
  const primeroOct = semanas.flat().find((c) => c && c.fecha === "2026-10-01");
  assert.equal(primeroOct.mes, "oct");
  assert.equal(primeroOct.esPrimeroDelMes, true);
  // Están los 31 días, sin repetir.
  assert.equal(semanas.flat().filter(Boolean).length, 31);
  assert.deepEqual(armarSemanas([]), []);
});

test("calendario: día elegido = el pedido, o el primero con horarios libres", () => {
  const dias = ventana((i) => (i === 4 || i === 8 ? 3 : 0));
  assert.equal(diaSeleccionado(dias, "2026-10-02"), "2026-10-02");
  assert.equal(diaSeleccionado(dias, ""), "2026-09-28");
  assert.equal(diaSeleccionado(dias, "2027-01-01"), "2026-09-28");
  assert.equal(diaSeleccionado(ventana(), ""), null);
});

test("calendario: la URL conserva profesional, servicio y fecha", () => {
  assert.equal(urlDisponibilidad({}), "/disponibilidad");
  assert.equal(
    urlDisponibilidad({ profesional: "a", servicio: "b", fecha: "2026-09-25", hora: "10:00" }),
    "/disponibilidad?profesional=a&servicio=b&fecha=2026-09-25"
  );
});

test("alta desde otorgar turno: solo vuelve a /turnos/nuevo", () => {
  const ok = "/turnos/nuevo?profesional=a&servicio=b&fecha=2026-09-25&hora=10%3A00";
  assert.equal(urlVolverTurno(ok), ok);
  for (const malo of [
    "",
    null,
    undefined,
    "https://otro-sitio.com/turnos/nuevo?x=1",
    "//otro-sitio.com/turnos/nuevo?x=1",
    "/turnos/nuevo",
    "/pacientes?x=1",
    "/turnos/nuevo/../../admin?x=1",
  ]) {
    assert.equal(urlVolverTurno(malo), null, String(malo));
  }
});

test("filtros de pacientes: lee la URL e ignora lo inválido", () => {
  assert.deepEqual(leerFiltrosPacientes({}), {
    texto: "",
    obra: null,
    edadMin: null,
    edadMax: null,
  });
  assert.deepEqual(leerFiltrosPacientes({ q: " Perez ", obra: uuid, edad: "18-39" }), {
    texto: "Perez",
    obra: uuid,
    edadMin: 18,
    edadMax: 39,
  });
  const mayores = leerFiltrosPacientes({ edad: "65-", obra: OBRA_PARTICULAR });
  assert.equal(mayores.edadMin, 65);
  assert.equal(mayores.edadMax, null);
  assert.equal(mayores.obra, "particular");
  // Valores manipulados: se ignoran.
  const raro = leerFiltrosPacientes({ obra: "'; drop", edad: "5-99" });
  assert.equal(raro.obra, null);
  assert.equal(raro.edadMin, null);
});

test("migración 011: solo funciones nuevas, con rol y sin anon", () => {
  const sql = readFileSync("supabase/migrations/011_mejoras_pacientes_calendario.sql", "utf8");
  assert.doesNotMatch(sql, /alter table|drop |create table/i);
  assert.match(sql, /function public\.fn_filtrar_pacientes/);
  assert.match(sql, /function public\.fn_consultar_disponibilidad_calendario/);
  assert.equal((sql.match(/if not public\.fn_es_recepcion\(\) then/g) ?? []).length, 2);
  assert.match(sql, /revoke all on function public\.fn_filtrar_pacientes\(text, text, integer, integer\) from public, anon/);
});
