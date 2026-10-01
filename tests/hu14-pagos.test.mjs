import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  aCentavos,
  calcularPago,
  centavosATexto,
  etiquetaMedio,
  formatearPesos,
  leerFiltrosPagos,
  MEDIOS_PAGO,
  MENSAJE_RANGO_INVALIDO,
  precioSugerido,
  urlPagos,
  validarCorreccion,
  validarFiltrosPagos,
} from "../src/lib/pagos/validar.ts";

// HU-14. Registrar y consultar pagos.
const particular = { importeBase: "15000", descuento: "", medio: "efectivo", conObraSocial: false };
const conObra = { importeBase: "20000", descuento: "5000", medio: "transferencia", conObraSocial: true };

test("medios: lista cerrada, sin texto libre ni obra social", () => {
  assert.deepEqual(
    MEDIOS_PAGO.map((m) => m.etiqueta),
    ["Efectivo", "Transferencia", "Tarjeta de débito", "Tarjeta de crédito"]
  );
  assert.equal(etiquetaMedio("debito"), "Tarjeta de débito");
  assert.equal(etiquetaMedio("obra_social"), "—");
});

test("importes: pesos con hasta dos decimales, coma o punto, en centavos", () => {
  assert.equal(aCentavos("15000"), 1500000);
  assert.equal(aCentavos("15000,5"), 1500050);
  assert.equal(aCentavos("15000.50"), 1500050);
  assert.equal(aCentavos(" 0,99 "), 99);
  for (const malo of ["", "abc", "1.500,00", "1.500", "10,123", "-5", "1e3", "12,", ",5", "123456789"]) {
    assert.equal(aCentavos(malo), null, malo);
  }
  // Sin errores de redondeo: 0,1 + 0,2 en centavos.
  assert.equal(aCentavos("0,1") + aCentavos("0,2"), aCentavos("0,3"));
  assert.equal(centavosATexto(1500050), "15000.50");
  assert.equal(centavosATexto(5), "0.05");
});

test("alta particular: final = base, sin descuento", () => {
  const r = calcularPago(particular);
  assert.deepEqual(r, { importes: { base: 1500000, descuento: 0, final: 1500000 } });
});

test("alta con obra social: final = base - descuento", () => {
  const r = calcularPago(conObra);
  assert.deepEqual(r, { importes: { base: 2000000, descuento: 500000, final: 1500000 } });
  assert.deepEqual(calcularPago({ ...conObra, descuento: "" }).importes.final, 2000000);
});

test("alta: rechaza importes, descuentos y medios inválidos", () => {
  const casos = [
    [{ ...particular, importeBase: "" }, "Ingresá el importe base"],
    [{ ...particular, importeBase: "0" }, "El importe base debe ser mayor que cero"],
    [{ ...particular, importeBase: "10,123" }, /importe base no es válido/],
    [{ ...particular, importeBase: "1.500" }, /sin puntos de miles/],
    [{ ...conObra, descuento: "-100" }, "El descuento no puede ser negativo"],
    [{ ...conObra, descuento: "20000" }, "El descuento no puede dejar el importe final en cero o menos"],
    [{ ...conObra, descuento: "25000" }, "El descuento no puede dejar el importe final en cero o menos"],
    [{ ...particular, descuento: "100" }, "Solo se aplica descuento si el turno tiene cobertura de obra social"],
    [{ ...particular, medio: "" }, "Elegí un medio de pago válido"],
    [{ ...particular, medio: "obra_social" }, "Elegí un medio de pago válido"],
  ];
  for (const [campos, esperado] of casos) {
    const r = calcularPago(campos);
    assert.ok("error" in r, JSON.stringify(campos));
    if (esperado instanceof RegExp) assert.match(r.error, esperado);
    else assert.equal(r.error, esperado);
  }
});

test("corrección: mismas reglas que el alta y motivo obligatorio", () => {
  assert.equal(validarCorreccion({ ...particular, motivo: "Se cobró con débito" }), null);
  assert.equal(validarCorreccion({ ...particular, motivo: "   " }), "Indicá el motivo de la corrección");
  assert.match(validarCorreccion({ ...particular, motivo: "x".repeat(201) }), /200 caracteres/);
  assert.equal(
    validarCorreccion({ ...conObra, descuento: "20000", motivo: "ok" }),
    "El descuento no puede dejar el importe final en cero o menos"
  );
});

test("precio sugerido del servicio y formato en pesos", () => {
  assert.equal(precioSugerido(15000), "15000");
  assert.equal(precioSugerido("15000.50"), "15000,50");
  assert.equal(precioSugerido(null), "", "Sin precio: el importe se exige a mano");
  assert.equal(precioSugerido(0), "");
  // Intl usa espacio duro entre "$" y el número.
  assert.equal(formatearPesos(15000.5).replace(/\s/g, " "), "$ 15.000,50");
  assert.equal(formatearPesos(null), "—");
});

test("filtros del listado: paciente y período de la fecha del pago", () => {
  assert.deepEqual(leerFiltrosPagos({}), { texto: "", desde: null, hasta: null, pagina: 1 });
  assert.deepEqual(
    leerFiltrosPagos({ q: " Pérez ", desde: "2026-10-01", hasta: "2026-10-31", pagina: "2" }),
    { texto: "Pérez", desde: "2026-10-01", hasta: "2026-10-31", pagina: 2 }
  );
  assert.equal(leerFiltrosPagos({ pagina: "-3" }).pagina, 1);

  const ok = leerFiltrosPagos({ desde: "2026-10-01", hasta: "2026-10-01" });
  assert.equal(validarFiltrosPagos(ok), null, "Desde igual a Hasta es válido");
  assert.equal(
    validarFiltrosPagos(leerFiltrosPagos({ desde: "2026-10-02", hasta: "2026-10-01" })),
    MENSAJE_RANGO_INVALIDO
  );
  assert.equal(validarFiltrosPagos(leerFiltrosPagos({ desde: "2026-02-30" })), "La fecha Desde no es válida");

  assert.equal(urlPagos(leerFiltrosPagos({})), "/pagos");
  assert.equal(
    urlPagos(leerFiltrosPagos({ q: "ana", desde: "2026-10-01" }), 3),
    "/pagos?q=ana&desde=2026-10-01&pagina=3"
  );
});

// --- Chequeos sobre la migración 017 ---

const sql = readFileSync("supabase/migrations/017_hu14_pagos.sql", "utf8");

test("migración 017: un pago por turno, importes consistentes y medios cerrados", () => {
  assert.match(sql, /constraint pago_un_pago_por_turno unique \(id_turno\)/);
  assert.match(sql, /importe_final = importe_base - descuento/);
  assert.match(sql, /medio_pago in \('efectivo', 'transferencia', 'debito', 'credito'\)/);
  assert.match(sql, /'Este turno ya tiene un pago registrado'/);
  // Bloquea el turno antes de mirar si ya hay pago (doble envío).
  assert.match(sql, /where t\.id_turno = p_id_turno\s+for update;/);
});

test("migración 017: rol con fn_exigir_rol, tablas cerradas y sin tocar lo existente", () => {
  for (const fn of ["fn_obtener_pago", "fn_registrar_pago", "fn_corregir_pago", "fn_listar_pagos"]) {
    assert.match(sql, new RegExp(`function public\\.${fn}\\(`), fn);
  }
  assert.equal((sql.match(/fn_exigir_rol\(array\['Gerente', 'Mesa de Entradas'\]\)/g) ?? []).length, 4);
  assert.doesNotMatch(sql, /rol_actual\(\)/);
  assert.match(sql, /revoke all on public\.pago from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.pago_correccion from public, anon, authenticated/);
  // No reemplaza funciones ni tablas existentes: cancelar, ausente y reprogramar quedan igual.
  assert.doesNotMatch(sql, /alter table public\.turno|drop table|drop function/i);
  for (const fn of ["fn_cancelar_turno", "fn_marcar_ausente", "fn_reprogramar_turno", "fn_otorgar_turno"]) {
    assert.doesNotMatch(sql, new RegExp(`function public\\.${fn}`), fn);
  }
});

test("migración 017: el período del listado es la fecha del pago en hora de Argentina", () => {
  assert.match(
    sql,
    /timezone\('America\/Argentina\/Buenos_Aires', p\.registrado_en\)\)::date >= p_desde/
  );
});
