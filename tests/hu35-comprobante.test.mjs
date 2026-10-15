import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatearNumeroComprobante,
  leerFiltrosPagos,
  leerNumeroComprobante,
  tituloComprobante,
  urlComprobante,
  urlPagos,
} from "../src/lib/pagos/validar.ts";

// HU-35. Comprobante de pago.
const idPago = "1583bc01-bdb4-4859-935c-0f4818505aed";

test("número de comprobante: 7 dígitos con ceros adelante", () => {
  assert.equal(formatearNumeroComprobante(123), "0000123");
  assert.equal(formatearNumeroComprobante("1"), "0000001");
  assert.equal(formatearNumeroComprobante(12345678), "12345678", "Si crece, se muestra entero");
  assert.equal(formatearNumeroComprobante(null), "—");
});

test("búsqueda por número: acepta con o sin ceros y rechaza lo inválido", () => {
  assert.equal(leerNumeroComprobante("0000123"), 123);
  assert.equal(leerNumeroComprobante(" 123 "), 123);
  for (const malo of ["", "0", "0000", "12a", "-5", "1.5", "1234567890123", null, undefined]) {
    assert.equal(leerNumeroComprobante(malo), null, String(malo));
  }
});

test("filtro Nº de comprobante: combinable y se conserva al paginar", () => {
  const filtros = leerFiltrosPagos({ q: "pérez", numero: "0000123", reembolso: "sin" });
  assert.equal(filtros.numero, 123);
  assert.equal(filtros.texto, "pérez");
  assert.equal(filtros.reembolso, "sin");
  const url = new URL(urlPagos(filtros, 2), "http://x");
  assert.equal(url.searchParams.get("numero"), "123");
  assert.deepEqual(leerFiltrosPagos(Object.fromEntries(url.searchParams)), { ...filtros, pagina: 2 });
  // Un número inválido se ignora (no rompe la pantalla).
  assert.equal(leerFiltrosPagos({ numero: "abc" }).numero, null);
});

test("título del PDF: número y paciente", () => {
  assert.equal(tituloComprobante(123, "Pérez", "Juan"), "Comprobante 0000123 - Pérez, Juan");
});

test("links al comprobante: ver y descargar PDF", () => {
  assert.equal(urlComprobante(idPago), `/pagos/${idPago}/comprobante`);
  assert.equal(urlComprobante(idPago, true), `/pagos/${idPago}/comprobante?imprimir=1`);
});

// --- Chequeos sobre la migración 025 y las pantallas ---

const sql = readFileSync("supabase/migrations/025_hu35_comprobante_pago.sql", "utf8");
const leer = (ruta) => readFileSync(ruta, "utf8");

test("migración 025: número por secuencia, único, obligatorio y numera los pagos existentes", () => {
  assert.match(sql, /create sequence if not exists public\.pago_numero_comprobante_seq/);
  assert.match(sql, /row_number\(\) over \(order by p\.registrado_en, p\.id_pago\)/);
  assert.match(sql, /set default nextval\('public\.pago_numero_comprobante_seq'\)/);
  assert.match(sql, /alter column numero_comprobante set not null/);
  assert.match(sql, /unique \(numero_comprobante\)/);
  assert.match(sql, /revoke all on sequence public\.pago_numero_comprobante_seq from public, anon, authenticated/);
  // El alta del pago no cambia: el número lo pone el default de la columna.
  assert.doesNotMatch(sql, /function public\.fn_registrar_pago/);
});

test("migración 025: comprobante por fn_*, con la regla de cobro de HU-17 y sin dos fn_listar_pagos", () => {
  assert.match(sql, /function public\.fn_obtener_comprobante\(p_id_pago uuid\)/);
  assert.match(sql, /'El comprobante no existe'/);
  assert.match(sql, /public\.fn_estado_cobro\(t\.estado, true, r\.id_reembolso is not null\)/);
  assert.equal((sql.match(/fn_exigir_rol\(array\['Gerente', 'Mesa de Entradas'\]\)/g) ?? []).length, 3);
  assert.match(sql, /drop function if exists public\.fn_listar_pagos\(text, date, date, integer, text\)/);
});

test("pantallas: comprobante, accesos y PDF sin librerías nuevas", () => {
  const pagina = leer("src/app/(main)/pagos/[id]/comprobante/page.tsx");
  assert.match(pagina, /await exigirRecepcion\(\)/);
  assert.match(pagina, /DescargarComprobanteButton/);

  const comprobante = leer("src/components/pagos/ComprobantePago.tsx");
  for (const texto of ["/logo-kinesys.svg", "KineSys", "Consultorio de kinesiología", "Corregido el", "Reembolsado el", "Registró el cobro"]) {
    assert.ok(comprobante.includes(texto), texto);
  }
  assert.match(leer("src/components/pagos/DescargarComprobanteButton.tsx"), /window\.print\(\)/);

  // Al registrar: Ver comprobante y Descargar PDF. En el detalle del turno y en /pagos: Ver comprobante.
  const pago = leer("src/app/(main)/turnos/[id]/pago/page.tsx");
  assert.match(pago, /urlComprobante\(pago\.id_pago, true\)/);
  assert.match(leer("src/app/(main)/turnos/[id]/page.tsx"), /urlComprobante\(detallePago\.pago\.id_pago\)/);
  const listado = leer("src/app/(main)/pagos/page.tsx");
  assert.match(listado, /urlComprobante\(pago\.id_pago\)/);
  assert.match(listado, /name="numero"/);

  // Sin dependencias nuevas.
  const paquete = JSON.parse(leer("package.json"));
  assert.deepEqual(Object.keys(paquete.dependencies).sort(), [
    "@supabase/ssr",
    "@supabase/supabase-js",
    "next",
    "react",
    "react-dom",
  ]);
});

// --- Migración 029: unifica las funciones de pagos de HU-21 (billetera) y HU-35 ---

const sql029 = readFileSync("supabase/migrations/029_unificar_pagos_hu21_hu35.sql", "utf8");

test("migración 029: una sola fn_listar_pagos con medio y nº de comprobante", () => {
  // Borra las cuatro firmas posibles antes de crear la unificada.
  for (const firma of [
    "text, date, date, integer, text)",
    "text, date, date, integer, text, text)",
    "text, date, date, integer, text, bigint)",
    "text, date, date, integer, text, text, bigint)",
  ]) {
    assert.ok(sql029.includes(`drop function if exists public.fn_listar_pagos(${firma}`), firma);
  }
  assert.match(sql029, /p_medio text default null,/);
  assert.match(sql029, /p_numero_comprobante bigint default null/);
  assert.equal((sql029.match(/create function public\.fn_listar_pagos\(/g) ?? []).length, 1);
});

test("migración 029: pago y comprobante con los dos números (operación y comprobante)", () => {
  assert.match(sql029, /'numero_comprobante', p\.numero_comprobante, -- HU-35/);
  assert.match(sql029, /'numero_operacion', p\.numero_operacion, -- HU-21/);
  assert.match(sql029, /function public\.fn_obtener_comprobante\(p_id_pago uuid\)[\s\S]*'numero_operacion', p\.numero_operacion/);
  assert.match(sql029, /public\.fn_estado_cobro\(/, "conserva el estado de cobro de HU-17");
  assert.match(leer("src/components/pagos/ComprobantePago.tsx"), /Nº de operación/);
});
