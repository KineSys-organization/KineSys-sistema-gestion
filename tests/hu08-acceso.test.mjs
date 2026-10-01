import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import {
  MENSAJE_SIN_PERMISO,
  PERMISOS_ACCIONES,
  ROLES,
  puedeAcceder,
  puedeHacer,
} from "../src/lib/auth/permisos.ts";

// Matriz de la HU-08: ruta -> [Gerente, Mesa de Entradas, Profesional]
const MATRIZ = {
  "/": [true, true, true],
  "/servicios": [true, true, false],
  "/obras-sociales": [true, false, false], // HU-31: catálogo, solo Gerente
  "/profesionales": [true, false, false],
  "/profesionales/nuevo": [true, false, false],
  "/profesionales/abc/editar": [true, false, false],
  "/profesionales/abc/horarios": [true, false, false],
  "/usuarios": [true, false, false], // HU-29 / HU-30: personal interno
  "/usuarios/nuevo": [true, false, false],
  "/usuarios/abc": [true, false, false],
  "/usuarios/abc/editar": [true, false, false],
  "/pacientes": [true, true, false],
  "/pacientes/nuevo": [true, true, false],
  "/pacientes/abc": [true, true, false],
  "/disponibilidad": [true, true, false],
  "/agenda": [true, true, false],
  "/turnos/nuevo": [true, true, false],
  "/turnos/abc": [true, true, false],
  "/turnos": [true, true, false], // HU-09: listado
  "/turnos/abc/reprogramar": [true, true, false], // HU-10C
  // HU-12/HU-13: la agenda propia y la atención son solo del Profesional.
  "/mi-agenda": [false, false, true],
  "/mi-agenda/abc": [false, false, true],
  // HU-26: indicadores generales, solo Gerente.
  "/indicadores": [true, false, false],
  // HU-14: pagos, Recepción y Gerente.
  "/pagos": [true, true, false],
  "/turnos/abc/pago": [true, true, false],
};
const ORDEN_ROLES = ["Gerente", "Mesa de Entradas", "Profesional"];

test("puedeAcceder respeta la matriz de permisos para los tres roles", () => {
  for (const [ruta, esperados] of Object.entries(MATRIZ)) {
    ORDEN_ROLES.forEach((rol, i) => {
      assert.equal(puedeAcceder(rol, ruta), esperados[i], `${rol} en ${ruta}`);
    });
  }
});

test("puedeAcceder ignora query string y barra final", () => {
  assert.equal(puedeAcceder("Mesa de Entradas", "/turnos/nuevo?profesional=1&hora=10:00"), true);
  assert.equal(puedeAcceder("Mesa de Entradas", "/profesionales/"), false);
  assert.equal(puedeAcceder("Profesional", "/?error=sin-permiso"), true);
});

test("puedeAcceder no confunde prefijos parecidos ni rutas fuera de la matriz", () => {
  assert.equal(puedeAcceder("Gerente", "/serviciosx"), false);
  assert.equal(puedeAcceder("Gerente", "/configuracion"), false);
});

test("sin rol de gestión (Paciente, vacío, null) no accede a nada", () => {
  for (const rol of ["Paciente", "", null, undefined, "gerente"]) {
    for (const ruta of Object.keys(MATRIZ)) {
      assert.equal(puedeAcceder(rol, ruta), false, `${rol} en ${ruta}`);
    }
  }
});

test("puedeHacer: servicios se ven desde recepción pero solo el Gerente los gestiona", () => {
  assert.equal(puedeHacer("Gerente", "servicios.gestionar"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "servicios.gestionar"), false);
  assert.equal(puedeHacer("Mesa de Entradas", "servicios.ver"), true);
  assert.equal(puedeHacer("Profesional", "servicios.ver"), false);
});

test("puedeHacer: cada acción según el rol", () => {
  const esperado = {
    "servicios.ver": [true, true, false],
    "servicios.gestionar": [true, false, false],
    "catalogo.gestionar": [true, false, false], // HU-31
    "profesionales.gestionar": [true, false, false],
    "usuarios.gestionar": [true, false, false], // HU-29 / HU-30
    "horarios.gestionar": [true, false, false],
    "pacientes.gestionar": [true, true, false],
    "disponibilidad.consultar": [true, true, false],
    "agenda.consultar": [true, true, false],
    "turnos.gestionar": [true, true, false],
    "turnos.cancelar": [true, true, false],
    "turnos.ausente": [true, true, false],
    "turnos.reprogramar": [true, true, false],
    "turnos.buscar": [true, true, false],
    "turnos.repetir": [true, true, false], // HU-25
    "atencion.agenda": [false, false, true],
    "atencion.registrar": [false, false, true],
    "atencion.dashboard": [false, false, true],
    "indicadores.consultar": [true, false, false],
    "pagos.registrar": [true, true, false],
    "pagos.consultar": [true, true, false],
    "pagos.corregir": [true, true, false],
  };
  assert.deepEqual(Object.keys(PERMISOS_ACCIONES).sort(), Object.keys(esperado).sort());
  for (const [accion, valores] of Object.entries(esperado)) {
    ORDEN_ROLES.forEach((rol, i) => {
      assert.equal(puedeHacer(rol, accion), valores[i], `${rol} -> ${accion}`);
    });
    assert.equal(puedeHacer("Paciente", accion), false);
    assert.equal(puedeHacer(null, accion), false);
  }
});

test("roles y mensaje de bloqueo", () => {
  assert.deepEqual([...ROLES].sort(), [...ORDEN_ROLES].sort());
  assert.equal(MENSAJE_SIN_PERMISO, "No tenés permisos para realizar esta acción");
});

// --- Chequeos sobre el código: que las capas 1 y 2 usen la matriz ---

function archivos(dir, nombre) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivos(ruta, nombre);
    return nombre(e.name) ? [ruta] : [];
  });
}

test("cada página de (main) exige el rol que marca la matriz", () => {
  const base = join("src", "app", "(main)");
  const paginas = archivos(base, (n) => n === "page.tsx");
  assert.ok(paginas.length >= 13, "se esperaban todas las páginas de (main)");

  for (const pagina of paginas) {
    const carpeta = relative(base, pagina).split(sep).slice(0, -1);
    const ruta = "/" + carpeta.map((p) => (p.startsWith("[") ? "x" : p)).join("/");
    const codigo = readFileSync(pagina, "utf8");

    if (ruta === "/") {
      assert.match(codigo, /obtenerUsuarioGestion\(\)/, "Inicio valida la sesión");
    } else if (puedeAcceder("Mesa de Entradas", ruta)) {
      assert.match(codigo, /await exigirRecepcion\(\)/, `${ruta} debe usar exigirRecepcion`);
    } else if (puedeAcceder("Profesional", ruta)) {
      // HU-12/HU-13: pantallas solo del Profesional.
      assert.equal(puedeAcceder("Gerente", ruta), false, `${ruta} es solo del Profesional`);
      assert.match(codigo, /await exigirProfesional\(\)/, `${ruta} debe usar exigirProfesional`);
    } else {
      assert.equal(puedeAcceder("Gerente", ruta), true, `${ruta} no está en la matriz`);
      assert.match(codigo, /await exigirGerente\(\)/, `${ruta} debe usar exigirGerente`);
    }
  }
});

test("cada server action repite el chequeo de rol", () => {
  const acciones = archivos(join("src", "lib"), (n) => /actions\.ts$/.test(n));
  // Funciones que solo delegan en otra action que ya chequea.
  const delegan = { consultarDisponibilidad: "obtenerDisponibilidad(" };
  let total = 0;

  for (const archivo of acciones) {
    const codigo = readFileSync(archivo, "utf8");
    const partes = codigo.split("export async function ").slice(1);
    for (const parte of partes) {
      const nombre = parte.slice(0, parte.indexOf("("));
      // El cuerpo termina en la primera "}" sola en su línea (no en el "}>" del tipo de retorno).
      const fin = parte.search(/\n}\r?(\n|$)/);
      const cuerpo = fin === -1 ? parte : parte.slice(0, fin + 2);
      total++;
      if (delegan[nombre]) {
        assert.ok(cuerpo.includes(delegan[nombre]), `${nombre} debe delegar`);
      } else {
        assert.match(cuerpo, /await exigirAccion\("[a-z.]+"\)/, `${archivo}: ${nombre} sin exigirAccion`);
      }
    }
  }
  assert.ok(total >= 25, `se esperaban al menos 25 server actions, hay ${total}`);
});
