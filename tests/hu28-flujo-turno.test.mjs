import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PASOS_TURNO,
  tieneHorario,
  urlPasoConfirmar,
  urlPasoHorario,
  urlPasoPaciente,
} from "../src/lib/turnos/flujo.ts";
import { urlVolverConPaciente, urlVolverTurno } from "../src/lib/pacientes/validar.ts";

// HU-28. Otorgar turno empezando por el paciente.
const pac = "1583bc01-bdb4-4859-935c-0f4818505aed";
const todo = { paciente: pac, profesional: "p1", servicio: "s1", fecha: "2026-10-02", hora: "10:00" };

test("pasos: paciente → servicio y profesional → fecha y horario → cobertura → confirmar", () => {
  assert.deepEqual(PASOS_TURNO, [
    "Paciente",
    "Servicio y profesional",
    "Fecha y horario",
    "Cobertura",
    "Confirmar",
  ]);
});

test("paso 1: /turnos/nuevo sin paciente, conserva lo que ya estaba elegido", () => {
  assert.equal(urlPasoPaciente(), "/turnos/nuevo");
  assert.equal(urlPasoPaciente({}), "/turnos/nuevo");
  // Desde la Agenda: profesional y día.
  assert.equal(
    urlPasoPaciente({ profesional: "p1", fecha: "2026-10-02" }),
    "/turnos/nuevo?profesional=p1&fecha=2026-10-02"
  );
  // "Cambiar paciente": saca al paciente y la hora, deja profesional, servicio y fecha.
  assert.equal(
    urlPasoPaciente(todo),
    "/turnos/nuevo?profesional=p1&servicio=s1&fecha=2026-10-02"
  );
});

test("pasos 2 y 3: /disponibilidad siempre con el paciente y sin hora", () => {
  assert.equal(urlPasoHorario({ paciente: pac }), `/disponibilidad?paciente=${pac}`);
  assert.equal(
    urlPasoHorario(todo),
    `/disponibilidad?paciente=${pac}&profesional=p1&servicio=s1&fecha=2026-10-02`
  );
});

test("pasos 4 y 5: /turnos/nuevo con todo lo elegido", () => {
  assert.equal(
    urlPasoConfirmar(todo),
    `/turnos/nuevo?paciente=${pac}&profesional=p1&servicio=s1&fecha=2026-10-02&hora=10%3A00`
  );
});

test("las URLs ignoran valores vacíos o con espacios", () => {
  assert.equal(urlPasoHorario({ paciente: pac, profesional: "  ", fecha: "" }), `/disponibilidad?paciente=${pac}`);
});

test("tieneHorario: hacen falta profesional, servicio, fecha y hora", () => {
  assert.equal(tieneHorario(todo), true);
  for (const falta of ["profesional", "servicio", "fecha", "hora"]) {
    assert.equal(tieneHorario({ ...todo, [falta]: "" }), false, falta);
  }
  assert.equal(tieneHorario({ paciente: pac }), false);
});

test("alta de paciente desde el paso 1: vuelve con el paciente elegido, con o sin parámetros", () => {
  // Paso 1 sin nada elegido (antes quedaba "/turnos/nuevo&paciente=..." roto).
  assert.equal(urlVolverConPaciente("/turnos/nuevo", pac), `/turnos/nuevo?paciente=${pac}`);
  // Con profesional y fecha (desde la Agenda).
  assert.equal(
    urlVolverConPaciente("/turnos/nuevo?profesional=p1&fecha=2026-10-02", pac),
    `/turnos/nuevo?profesional=p1&fecha=2026-10-02&paciente=${pac}`
  );
  // El ?volver= que arma el paso 1 pasa el filtro de seguridad.
  assert.equal(urlVolverTurno(urlPasoPaciente()), "/turnos/nuevo");
  assert.equal(urlVolverTurno(urlPasoPaciente({ profesional: "p1" })), "/turnos/nuevo?profesional=p1");
});

// --- Chequeos sobre el código: el orden nuevo está cableado en las pantallas ---

const leer = (ruta) => readFileSync(ruta, "utf8");

test("el menú y la tarjeta de Inicio abren el paso 1 (paciente)", () => {
  assert.match(leer("src/components/Navegacion.tsx"), /href: "\/turnos\/nuevo", texto: "Otorgar turno"/);
  assert.match(leer("src/app/(main)/page.tsx"), /href: "\/turnos\/nuevo",\s*titulo: "Otorgar turno"/);
});

test("/disponibilidad sin paciente vuelve al paso 1", () => {
  const codigo = leer("src/app/(main)/disponibilidad/page.tsx");
  assert.match(codigo, /if \(!params\.paciente\) \{\s*redirect\(urlPasoPaciente\(params\)\);/);
});

test("/turnos/nuevo pide el paciente antes que el horario", () => {
  const codigo = leer("src/app/(main)/turnos/nuevo/page.tsx");
  const pidePaciente = codigo.indexOf("if (!datos.paciente)");
  const pideHorario = codigo.indexOf("if (!tieneHorario(datos))");
  assert.ok(pidePaciente > 0 && pideHorario > pidePaciente, "primero el paciente, después el horario");
});

test("ningún link del flujo usa la URL vieja sin paciente", () => {
  for (const archivo of [
    "src/app/(main)/disponibilidad/page.tsx",
    "src/app/(main)/turnos/nuevo/page.tsx",
    "src/app/(main)/turnos/[id]/page.tsx",
    "src/app/(main)/agenda/page.tsx",
    "src/components/disponibilidad/SelectorProfesionalServicio.tsx",
    "src/components/turnos/OtorgarTurnoForm.tsx",
  ]) {
    const codigo = leer(archivo);
    assert.doesNotMatch(codigo, /urlDisponibilidad|href="\/disponibilidad"/, archivo);
  }
});
