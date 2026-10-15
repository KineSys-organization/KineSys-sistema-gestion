import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  armarMes,
  colorPorEstado,
  diaElegido,
  esMesValido,
  nombreMes,
  proximidad,
  sumarMeses,
  textoProximidad,
  urlDashboard,
} from "../src/lib/dashboard/calendario.ts";

const turno = (fecha, estado = "confirmado", hora = "09:00") => ({
  id_turno: `${fecha}-${hora}`,
  estado,
  fecha,
  hora_inicio: hora,
  hora_fin: "09:30",
  nombre_paciente: "Ana",
  apellido_paciente: "Pérez",
  nombre_servicio: "Evaluación inicial",
});

test("color del turno: confirmado azul, atendido verde, ausente naranja y cancelado gris", () => {
  assert.equal(colorPorEstado("confirmado"), "azul");
  assert.equal(colorPorEstado("atendido"), "verde");
  assert.equal(colorPorEstado("ausente"), "naranja");
  assert.equal(colorPorEstado("cancelado"), "gris");
});

test("proximidad: icono para hoy, 1-3, 4-7 y más de 7 días", () => {
  const hoy = "2026-09-29";
  assert.equal(proximidad(turno("2026-09-29"), hoy), "hoy");
  assert.equal(proximidad(turno("2026-09-30"), hoy), "pronto");
  assert.equal(proximidad(turno("2026-10-02"), hoy), "pronto");
  assert.equal(proximidad(turno("2026-10-03"), hoy), "semana");
  assert.equal(proximidad(turno("2026-10-06"), hoy), "semana");
  assert.equal(proximidad(turno("2026-10-07"), hoy), "lejos");
  assert.equal(proximidad(turno("2026-10-08"), hoy), "lejos");
});

test("sin icono de proximidad para atendidos, cancelados, ausentes y confirmados pasados", () => {
  const hoy = "2026-09-29";
  assert.equal(proximidad(turno("2026-09-29", "atendido"), hoy), null);
  assert.equal(proximidad(turno("2026-10-01", "cancelado"), hoy), null);
  assert.equal(proximidad(turno("2026-09-28", "ausente"), hoy), null);
  assert.equal(proximidad(turno("2026-09-28"), hoy), null);
});

test("el ícono tiene texto accesible y el turno conserva su estado textual", () => {
  assert.equal(textoProximidad("2026-09-29", "2026-09-29"), "Hoy");
  assert.equal(textoProximidad("2026-09-30", "2026-09-29"), "Mañana");
  assert.equal(textoProximidad("2026-10-04", "2026-09-29"), "En 5 días");
  assert.equal(textoProximidad("2026-09-27", "2026-09-29"), "Hace 2 días");
});

test("mes: valida, navega (cruza el año) y se nombra en castellano", () => {
  assert.equal(esMesValido("2026-09"), true);
  assert.equal(esMesValido("2026-13"), false);
  assert.equal(esMesValido("2026-9"), false);
  assert.equal(esMesValido(""), false);
  assert.equal(sumarMeses("2026-01", -1), "2025-12");
  assert.equal(sumarMeses("2026-12", 1), "2027-01");
  assert.equal(nombreMes("2026-09"), "septiembre de 2026");
  assert.equal(urlDashboard("2026-09", "2026-09-29"), "/?mes=2026-09&dia=2026-09-29");
});

test("calendario: semanas de lunes a domingo, sábado y domingo incluidos", () => {
  // Septiembre 2026 empieza un martes y tiene 30 días.
  const semanas = armarMes("2026-09", [turno("2026-09-05"), turno("2026-09-05", "atendido", "10:00")]);
  assert.equal(semanas[0][0], null);
  assert.equal(semanas[0][1].fecha, "2026-09-01");
  assert.ok(semanas.every((s) => s.length === 7));
  const dias = semanas.flat().filter(Boolean);
  assert.equal(dias.length, 30);
  // El sábado 5 tiene sus dos turnos; el resto queda vacío.
  const sabado = dias.find((d) => d.fecha === "2026-09-05");
  assert.equal(sabado.turnos.length, 2);
  assert.equal(dias.filter((d) => d.turnos.length > 0).length, 1);
});

test("calendario: un mes sin turnos se arma igual, vacío", () => {
  const dias = armarMes("2027-02", []).flat().filter(Boolean);
  assert.equal(dias.length, 28);
  assert.ok(dias.every((d) => d.turnos.length === 0));
});

test("día elegido: el pedido, si no hoy, si no el primero con turnos", () => {
  const turnos = [turno("2026-10-14")];
  assert.equal(diaElegido("2026-09", "2026-09-10", "2026-09-29", []), "2026-09-10");
  assert.equal(diaElegido("2026-09", "2026-10-01", "2026-09-29", []), "2026-09-29");
  assert.equal(diaElegido("2026-10", "", "2026-09-29", turnos), "2026-10-14");
  assert.equal(diaElegido("2026-11", "", "2026-09-29", []), null);
});

test("solo el Profesional ve el dashboard y el id sale de la sesión", () => {
  const inicio = readFileSync("src/app/(main)/page.tsx", "utf8");
  assert.match(inicio, /rol === "Profesional" && \(\s*<DashboardProfesional/);

  const action = readFileSync("src/lib/dashboard/actions.ts", "utf8");
  const chequeo = action.indexOf('exigirAccion("atencion.dashboard")');
  const rpc = action.indexOf('rpc("fn_consultar_dashboard_profesional"');
  assert.ok(chequeo > 0 && rpc > chequeo, "exigirAccion va antes de la RPC");
  assert.doesNotMatch(action, /id_profesional|\.from\(/);

  const migracion = readFileSync("supabase/migrations/017_hu15_dashboard_profesional.sql", "utf8");
  assert.match(migracion, /fn_exigir_rol\(array\['Profesional'\]\)/);
  assert.match(migracion, /auth\.uid\(\)/);
});

test("cada turno del día abre /mi-agenda/[id]", () => {
  const componente = readFileSync("src/components/dashboard/DashboardProfesional.tsx", "utf8");
  assert.match(componente, /href=\{`\/mi-agenda\/\$\{t\.id_turno\}`\}/);
  assert.match(componente, /Colores = estado/);
  assert.match(componente, /Íconos = proximidad/);
  assert.match(componente, /aria-label/);
  assert.match(componente, /turno-color-\$\{colorPorEstado\(t\.estado\)\}/);
});

test("la leyenda y los SVG incluyen íconos de proximidad hasta más de 7 días", () => {
  const componente = readFileSync("src/components/dashboard/DashboardProfesional.tsx", "utf8");
  const calendario = readFileSync("src/lib/dashboard/calendario.ts", "utf8");
  for (const tipo of ["hoy", "pronto", "semana", "lejos"]) {
    assert.match(componente, new RegExp(`tipo === "${tipo}"`));
  }
  assert.match(calendario, /\{ proximidad: "lejos", texto: "Más de 7 días" \}/);
  assert.doesNotMatch(componente, /Más de 7 días: sin ícono/);
});

test("EstadoTurnoBadge comparte los colores por estado en las agendas", () => {
  const badge = readFileSync("src/components/turnos/EstadoTurnoBadge.tsx", "utf8");
  assert.match(badge, /colorPorEstado\(estado\)/);
  for (const ruta of ["agenda/page.tsx", "mi-agenda/page.tsx", "turnos/page.tsx"]) {
    const codigo = readFileSync(`src/app/(main)/${ruta}`, "utf8");
    assert.match(codigo, /EstadoTurnoBadge/);
  }
});
