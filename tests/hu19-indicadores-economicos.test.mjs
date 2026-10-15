import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  anchoBarra,
  describirVariacion,
  nombreMes,
  SIN_DATOS_PARA_COMPARAR,
} from "../src/lib/indicadores/economicos.ts";
import { formatearPesos } from "../src/lib/pagos/validar.ts";
import { puedeAcceder, puedeHacer } from "../src/lib/auth/permisos.ts";

// HU-19. Indicadores económicos.

test("variación: sube, baja, igual y sin datos (anterior en 0, sin dividir por cero)", () => {
  assert.deepEqual(describirVariacion(16000, 266.7), { tendencia: "sube", porcentaje: "+266,7 %" });
  assert.deepEqual(describirVariacion(-1500, -25), { tendencia: "baja", porcentaje: "-25 %" });
  assert.deepEqual(describirVariacion(0, 0), { tendencia: "igual", porcentaje: "0 %" });
  assert.deepEqual(describirVariacion(5000, null), {
    tendencia: "sin_datos",
    porcentaje: SIN_DATOS_PARA_COMPARAR,
  });
  assert.equal(SIN_DATOS_PARA_COMPARAR, "Sin datos para comparar");
});

test("importes en pesos con 2 decimales y separador de miles", () => {
  assert.equal(formatearPesos(12345.67).replace(/\s/g, " "), "$ 12.345,67");
  assert.equal(formatearPesos(0).replace(/\s/g, " "), "$ 0,00");
});

test("últimos 6 meses: nombre del mes y ancho de las barras", () => {
  assert.equal(nombreMes("2026-05"), "may 2026");
  assert.equal(nombreMes("2019-12"), "dic 2019");
  assert.equal(anchoBarra(22000, 22000), 100);
  assert.equal(anchoBarra(6000, 22000), 27);
  assert.equal(anchoBarra(0, 22000), 0);
  assert.equal(anchoBarra(-500, 22000), 0, "netos negativos no dibujan barra");
  assert.equal(anchoBarra(0, 0), 0, "todo en 0: sin dividir por cero");
});

test("solo Gerente: /indicadores y la acción de indicadores", () => {
  assert.equal(puedeAcceder("Gerente", "/indicadores"), true);
  assert.equal(puedeAcceder("Mesa de Entradas", "/indicadores"), false);
  assert.equal(puedeAcceder("Profesional", "/indicadores"), false);
  assert.equal(puedeHacer("Gerente", "indicadores.consultar"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "indicadores.consultar"), false);
});

// --- Chequeos sobre la migración 030 y la pantalla ---

const sql = readFileSync("supabase/migrations/030_hu19_indicadores_economicos.sql", "utf8");
const leer = (ruta) => readFileSync(ruta, "utf8");

test("migración 030: solo lectura, solo Gerente y período ≤ 366 días", () => {
  assert.match(sql, /function public\.fn_consultar_indicadores_economicos\(\s*p_desde date,\s*p_hasta date/);
  assert.match(sql, /perform public\.fn_exigir_rol\(array\['Gerente'\]\)/);
  assert.match(sql, /p_hasta - p_desde > 366/);
  assert.match(sql, /\bstable\b/);
  assert.doesNotMatch(sql, /insert into|update public\.|delete from|alter table|create table/i);
  assert.match(sql, /revoke all on function public\.fn_consultar_indicadores_economicos\(date, date\) from public, anon/);
});

test("migración 030: ingresos por fecha del pago (hora AR), reembolsos por su fecha y sin dividir por cero", () => {
  assert.match(sql, /timezone\('America\/Argentina\/Buenos_Aires', p\.registrado_en\)\)::date\s+between p_desde and p_hasta/);
  assert.match(sql, /timezone\('America\/Argentina\/Buenos_Aires', r\.registrado_en\)\)::date\s+between p_desde and p_hasta/);
  assert.match(sql, /when v_ant_netos = 0 then null/);
  assert.match(sql, /when v_cantidad = 0 then 0/);
  // Los 5 medios, incluida la billetera (HU-21).
  assert.match(sql, /\('efectivo', 1\), \('transferencia', 2\), \('debito', 3\), \('credito', 4\), \('billetera', 5\)/);
  // Pendientes de cobro con la regla única de HU-17.
  assert.match(sql, /public\.fn_estado_cobro\(t\.estado, pg\.id_pago is not null, r\.id_reembolso is not null\)\s+= 'pendiente'/);
});

test("pantalla: sección Económicos en /indicadores con el mismo período", () => {
  const pagina = leer("src/app/(main)/indicadores/page.tsx");
  assert.match(pagina, /await exigirGerente\(\)/);
  assert.match(pagina, /obtenerIndicadoresEconomicos\(periodo\)/);
  assert.match(pagina, /<SeccionEconomicos datos=\{economicos\.data\} \/>/);

  const seccion = leer("src/components/indicadores/SeccionEconomicos.tsx");
  for (const texto of ["Ingresos netos", "Ingresos brutos", "Reembolsos", "Pendientes de cobro", "Por medio de pago",
    "Particular y obra social", "Descuentos aplicados", "últimos 6 meses", "Por servicio", "Por profesional"]) {
    assert.ok(seccion.includes(texto), texto);
  }
  // Barras en CSS, sin librerías de gráficos.
  const paquete = JSON.parse(leer("package.json"));
  assert.deepEqual(Object.keys(paquete.dependencies).sort(), [
    "@supabase/ssr",
    "@supabase/supabase-js",
    "next",
    "react",
    "react-dom",
  ]);
});

test("gráficos de barras: Ver gráfico en medio, servicio y profesional, sin librerías", () => {
  const grafico = leer("src/components/indicadores/GraficoBarras.tsx");
  assert.match(grafico, /<details className="grafico-desplegable">/);
  assert.match(grafico, /Ver gráfico/);
  assert.match(grafico, /Ocultar gráfico/);
  assert.match(grafico, /height: `\$\{anchoBarra\(/, "la altura sale de anchoBarra");
  assert.doesNotMatch(grafico, /"use client"/, "sin JavaScript de cliente");

  const seccion = leer("src/components/indicadores/SeccionEconomicos.tsx");
  for (const titulo of ["Ingresos por medio de pago", "Ingresos por servicio", "Ingresos por profesional"]) {
    assert.ok(seccion.includes(`titulo="${titulo}"`), titulo);
  }
});
