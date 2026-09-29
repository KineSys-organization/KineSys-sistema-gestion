import assert from "node:assert/strict";
import test from "node:test";
import {
  ESTADOS_FILTRO,
  leerFiltrosTurnos,
  MENSAJE_RANGO_INVALIDO,
  totalPaginas,
  URL_TURNOS_SIN_FILTROS,
  urlTurnos,
  validarFiltrosTurnos,
} from "../src/lib/turnos/busqueda.ts";

const HOY = "2026-09-29";
const uuid = "1583bc01-bdb4-4859-935c-0f4818505aed";
const otroUuid = "7cbc17f6-c0c6-409e-91b7-1d39ca312aec";

test("CA1: al entrar sin filtros, Desde y Hasta arrancan en hoy y en la página 1", () => {
  assert.deepEqual(leerFiltrosTurnos({}, HOY), {
    texto: "",
    profesional: null,
    servicio: null,
    desde: HOY,
    hasta: HOY,
    estado: null,
    pagina: 1,
  });
});

test("CA12: Limpiar filtros saca también el rango de fechas", () => {
  const url = new URL(URL_TURNOS_SIN_FILTROS, "http://x");
  const params = Object.fromEntries(url.searchParams);
  const filtros = leerFiltrosTurnos(params, HOY);
  assert.equal(filtros.desde, null);
  assert.equal(filtros.hasta, null);
  assert.equal(validarFiltrosTurnos(filtros), null);
});

test("lee todos los filtros de la URL", () => {
  const filtros = leerFiltrosTurnos(
    {
      q: "  Ana Pérez ",
      profesional: uuid,
      servicio: otroUuid,
      desde: "2026-09-01",
      hasta: "2026-09-30",
      estado: "ausente",
      pagina: "3",
    },
    HOY
  );
  assert.deepEqual(filtros, {
    texto: "Ana Pérez",
    profesional: uuid,
    servicio: otroUuid,
    desde: "2026-09-01",
    hasta: "2026-09-30",
    estado: "ausente",
    pagina: 3,
  });
});

test("CA3/CA4/CA7: 'Todos' o un valor desconocido no restringen", () => {
  const filtros = leerFiltrosTurnos(
    { profesional: "", servicio: "no-es-uuid", estado: "todos", desde: "", hasta: "" },
    HOY
  );
  assert.equal(filtros.profesional, null);
  assert.equal(filtros.servicio, null);
  assert.equal(filtros.estado, null);
  // Un estado que no existe tampoco pasa (lo rechazaría la base).
  assert.equal(leerFiltrosTurnos({ estado: "borrado" }, HOY).estado, null);
});

test("CA7: el filtro de estado ofrece los 4 estados", () => {
  assert.deepEqual(
    ESTADOS_FILTRO.map((e) => e.etiqueta),
    ["Confirmado", "Cancelado", "Atendido", "Ausente"]
  );
});

test("página inválida → 1", () => {
  for (const pagina of ["0", "-2", "abc", ""]) {
    assert.equal(leerFiltrosTurnos({ pagina }, HOY).pagina, 1, `pagina=${pagina}`);
  }
});

test("CA5: la misma fecha en Desde y Hasta es válida (un día)", () => {
  const filtros = leerFiltrosTurnos({ desde: HOY, hasta: HOY }, HOY);
  assert.equal(validarFiltrosTurnos(filtros), null);
});

test("CA6: Hasta anterior a Desde se rechaza", () => {
  const filtros = leerFiltrosTurnos({ desde: "2026-09-10", hasta: "2026-09-09" }, HOY);
  assert.equal(validarFiltrosTurnos(filtros), MENSAJE_RANGO_INVALIDO);
});

test("fechas mal escritas se rechazan", () => {
  assert.equal(
    validarFiltrosTurnos(leerFiltrosTurnos({ desde: "2026-02-30", hasta: "" }, HOY)),
    "La fecha Desde no es válida"
  );
  assert.equal(
    validarFiltrosTurnos(leerFiltrosTurnos({ desde: "", hasta: "29/09/2026" }, HOY)),
    "La fecha Hasta no es válida"
  );
});

test("CA10: paginar conserva los filtros; filtrar vuelve a la página 1", () => {
  const filtros = leerFiltrosTurnos(
    { q: "ana", profesional: uuid, desde: "2026-09-01", hasta: "", estado: "confirmado" },
    HOY
  );
  const url = new URL(urlTurnos(filtros, 2), "http://x");
  assert.equal(url.pathname, "/turnos");
  assert.equal(url.searchParams.get("q"), "ana");
  assert.equal(url.searchParams.get("profesional"), uuid);
  assert.equal(url.searchParams.get("desde"), "2026-09-01");
  assert.equal(url.searchParams.get("hasta"), ""); // vacío = sin límite, no "hoy"
  assert.equal(url.searchParams.get("estado"), "confirmado");
  assert.equal(url.searchParams.get("pagina"), "2");

  // Volver a leer la URL da los mismos filtros (ida y vuelta).
  const releidos = leerFiltrosTurnos(Object.fromEntries(url.searchParams), HOY);
  assert.deepEqual(releidos, { ...filtros, pagina: 2 });

  // Página 1: no se agrega "pagina".
  assert.equal(new URL(urlTurnos(filtros, 1), "http://x").searchParams.has("pagina"), false);
});

test("CA10: 10 turnos por página", () => {
  assert.equal(totalPaginas(0), 1);
  assert.equal(totalPaginas(10), 1);
  assert.equal(totalPaginas(11), 2);
  assert.equal(totalPaginas(25), 3);
});
