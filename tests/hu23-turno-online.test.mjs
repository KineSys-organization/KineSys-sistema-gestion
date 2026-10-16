import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  coberturaInicial,
  coberturaParaRpc,
  formatearPrecio,
  limpiarDatos,
  PARTICULAR,
  pasoPortal,
  PASOS_PORTAL,
  urlPortalNuevo,
  validarSacarTurno,
} from "../src/lib/portal/validar.ts";
import { puedeAcceder, ROLES } from "../src/lib/auth/permisos.ts";

// HU-23. Sacar turno online (portal del paciente).
const serv = "1583bc01-bdb4-4859-935c-0f4818505aed";
const prof = "2a83bc01-bdb4-4859-935c-0f4818505aee";
const obra = "3b83bc01-bdb4-4859-935c-0f4818505aef";

test("pasos: servicio → profesional → día y horario → confirmar", () => {
  assert.deepEqual([...PASOS_PORTAL], ["Servicio", "Profesional", "Día y horario", "Confirmar"]);
  assert.equal(pasoPortal({}), 1);
  assert.equal(pasoPortal({ servicio: serv }), 2);
  assert.equal(pasoPortal({ servicio: serv, profesional: prof }), 3);
  assert.equal(pasoPortal({ servicio: serv, profesional: prof, fecha: "2026-10-20" }), 3);
  assert.equal(pasoPortal({ servicio: serv, profesional: prof, fecha: "2026-10-20", hora: "10:00" }), 4);
});

test("datos de la URL: lo inválido o fuera de orden se descarta", () => {
  assert.deepEqual(limpiarDatos({ servicio: "x", profesional: prof }), {});
  assert.deepEqual(limpiarDatos({ servicio: serv, profesional: "x", fecha: "2026-10-20" }), { servicio: serv });
  assert.deepEqual(limpiarDatos({ servicio: serv, profesional: prof, fecha: "20/10", hora: "10:00" }), {
    servicio: serv,
    profesional: prof,
  });
  assert.deepEqual(limpiarDatos({ servicio: serv, profesional: prof, fecha: "2026-10-20", hora: "25:00" }), {
    servicio: serv,
    profesional: prof,
    fecha: "2026-10-20",
  });
  // Sin fecha no hay hora.
  assert.equal(pasoPortal({ servicio: serv, profesional: prof, hora: "10:00" }), 3);
});

test("urlPortalNuevo conserva lo elegido en orden", () => {
  assert.equal(urlPortalNuevo(), "/portal/nuevo");
  assert.equal(urlPortalNuevo({ servicio: serv }), `/portal/nuevo?servicio=${serv}`);
  assert.equal(
    urlPortalNuevo({ servicio: serv, profesional: prof, fecha: "2026-10-20", hora: "10:00" }),
    `/portal/nuevo?servicio=${serv}&profesional=${prof}&fecha=2026-10-20&hora=10%3A00`
  );
  // "Cambiar horario": sin la hora vuelve al calendario de ese día.
  assert.equal(
    urlPortalNuevo({ servicio: serv, profesional: prof, fecha: "2026-10-20", hora: undefined }),
    `/portal/nuevo?servicio=${serv}&profesional=${prof}&fecha=2026-10-20`
  );
});

test("validarSacarTurno: obligatorios, pasado y cobertura", () => {
  // 12:00 de Argentina, explícito para que no dependa de la zona de la máquina.
  const ahora = new Date("2026-10-15T12:00:00-03:00");
  const ok = { id_servicio: serv, id_profesional: prof, fecha: "2026-10-20", hora: "10:00", cobertura: PARTICULAR };
  assert.equal(validarSacarTurno(ok, ahora), null);
  assert.equal(validarSacarTurno({ ...ok, cobertura: obra }, ahora), null);
  assert.equal(validarSacarTurno({ ...ok, id_servicio: "" }, ahora), "Elegí un servicio");
  assert.equal(validarSacarTurno({ ...ok, id_profesional: "x" }, ahora), "Elegí un profesional");
  assert.equal(validarSacarTurno({ ...ok, hora: "" }, ahora), "Elegí el día y el horario");
  assert.equal(
    validarSacarTurno({ ...ok, fecha: "2026-10-15", hora: "11:00" }, ahora),
    "No se pueden sacar turnos en una fecha u hora pasada"
  );
  // Hoy 14:00 (AR) con "ahora" 12:00 (AR) es futuro, aunque el servidor esté en UTC.
  assert.equal(validarSacarTurno({ ...ok, fecha: "2026-10-15", hora: "14:00" }, ahora), null);
  assert.equal(validarSacarTurno({ ...ok, cobertura: "" }, ahora), "Elegí con qué cobertura te atendés");
  assert.equal(validarSacarTurno({ ...ok, cobertura: "osde" }, ahora), "Cobertura inválida");
});

test("cobertura: una obra preseleccionada, ninguna = Particular, varias = elige", () => {
  assert.equal(coberturaInicial([]), PARTICULAR);
  assert.equal(coberturaInicial([{ id_obra_social: obra }]), obra);
  assert.equal(coberturaInicial([{ id_obra_social: obra }, { id_obra_social: serv }]), "");
  assert.equal(coberturaParaRpc(PARTICULAR), null);
  assert.equal(coberturaParaRpc(obra), obra);
});

test("precio de referencia con 2 decimales y separador de miles", () => {
  assert.equal(formatearPrecio(12500), "$ 12.500,00");
  assert.equal(formatearPrecio("1000.5"), "$ 1.000,50");
  assert.equal(formatearPrecio(null), null);
});

// --- Chequeos sobre el código ---

function archivos(dir, nombre) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivos(ruta, nombre);
    return nombre(e.name) ? [ruta] : [];
  });
}

test("las páginas privadas del portal exigen un paciente", () => {
  const base = join("src", "app", "(portal)", "portal", "(privado)");
  const paginas = archivos(base, (n) => n === "page.tsx" || n === "layout.tsx");
  assert.ok(paginas.length >= 3, "se esperaban layout, Mis turnos y Sacar turno");
  for (const pagina of paginas) {
    assert.match(readFileSync(pagina, "utf8"), /await exigirPaciente\(\)/, `${pagina} sin exigirPaciente`);
  }
});

test("el portal no consulta tablas ni manda el id del paciente", () => {
  const codigo = [
    ...archivos(join("src", "app", "(portal)"), (n) => /\.tsx?$/.test(n)),
    ...archivos(join("src", "lib", "portal"), (n) => /\.ts$/.test(n)),
    ...archivos(join("src", "components", "portal"), (n) => /\.tsx$/.test(n)),
  ].map((f) => readFileSync(f, "utf8"));
  for (const c of codigo) {
    assert.doesNotMatch(c, /\.from\(/);
    assert.doesNotMatch(c, /p_id_paciente/);
  }
});

test("/portal no es una ruta de gestión (ningún rol de gestión la tiene en la matriz)", () => {
  for (const rol of ROLES) {
    assert.equal(puedeAcceder(rol, "/portal"), false);
    assert.equal(puedeAcceder(rol, "/portal/nuevo"), false);
  }
});

test("el ingreso del portal usa fn_acceso_paciente y cierra sesión si no es paciente", () => {
  const codigo = readFileSync(join("src", "app", "(portal)", "portal", "ingresar", "actions.ts"), "utf8");
  assert.match(codigo, /rpc\("fn_acceso_paciente"\)/);
  assert.match(codigo, /signOut\(\)/);
});

test("el proxy manda /portal sin sesión al ingreso del portal, no a /login", () => {
  const codigo = readFileSync(join("src", "lib", "supabase", "middleware.ts"), "utf8");
  assert.match(codigo, /RUTA_INGRESO_PORTAL = "\/portal\/ingresar"/);
  assert.match(codigo, /fn_acceso_paciente/);
});

test("un paciente que entra a gestión no pierde la sesión y vuelve a /portal", () => {
  // obtenerUsuarioGestion solo cierra la sesión si tampoco es un paciente del portal.
  const auth = readFileSync(join("src", "lib", "auth", "index.ts"), "utf8");
  assert.match(auth, /rpc\("fn_acceso_paciente"\)[\s\S]*if \(!paciente\) await supabase\.auth\.signOut\(\)/);

  // En /login, el proxy manda al paciente con sesión a su portal.
  const proxy = readFileSync(join("src", "lib", "supabase", "middleware.ts"), "utf8");
  const login = proxy.slice(proxy.indexOf("if (user && esRutaPublica)"));
  assert.match(login, /fn_acceso_paciente[\s\S]*url\.pathname = "\/portal"/);
});
