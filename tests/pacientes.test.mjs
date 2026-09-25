import assert from "node:assert/strict";
import test from "node:test";
import {
  esIdPaciente,
  MENSAJE_APELLIDO,
  MENSAJE_DNI,
  MENSAJE_NOMBRE,
  MENSAJE_TELEFONO,
  parsearObrasFormulario,
  validarAltaPaciente,
  validarEdicionPaciente,
} from "../src/lib/pacientes/validar.ts";

const HOY = "2026-09-25";

const altaBase = {
  nombre_paciente: "Ana",
  apellido_paciente: "García",
  dni_paciente: "30111222",
  fecha_nacimiento_paciente: "1990-05-10",
  telefono_paciente: "3874209876",
  mail_paciente: "ana@mail.com",
  obras: [],
};

test("alta: exige campos básicos", () => {
  assert.equal(validarAltaPaciente({ ...altaBase, nombre_paciente: "" }, HOY), "Faltan campos");
  assert.equal(validarAltaPaciente({ ...altaBase, dni_paciente: " " }, HOY), "Faltan campos");
  assert.equal(validarAltaPaciente({ ...altaBase, mail_paciente: "malo" }, HOY), "El mail no es válido");
  assert.equal(validarAltaPaciente(altaBase, HOY), null);
});

test("alta: nombre y apellido solo letras (acepta acentos, ñ, espacio, guion y apóstrofo)", () => {
  for (const nombre of ["Ana2", "Ana!", "@na", "Ana  María", "-Ana"]) {
    assert.equal(validarAltaPaciente({ ...altaBase, nombre_paciente: nombre }, HOY), MENSAJE_NOMBRE);
  }
  assert.equal(
    validarAltaPaciente({ ...altaBase, apellido_paciente: "García3" }, HOY),
    MENSAJE_APELLIDO
  );
  for (const nombre of ["María José", "Íñigo", "Pérez-Gil", "D'Angelo"]) {
    assert.equal(validarAltaPaciente({ ...altaBase, nombre_paciente: nombre }, HOY), null);
  }
});

test("alta: DNI de 7 u 8 números, sin puntos ni letras", () => {
  for (const dni of ["0", "123456", "123456789", "30.111.222", "3011122a", "-3011122"]) {
    assert.equal(validarAltaPaciente({ ...altaBase, dni_paciente: dni }, HOY), MENSAJE_DNI);
  }
  assert.equal(validarAltaPaciente({ ...altaBase, dni_paciente: "4577428" }, HOY), null);
});

test("alta: teléfono de 10 números y nacimiento no futuro", () => {
  for (const telefono of ["111", "387-4209876", "03874209876"]) {
    assert.equal(
      validarAltaPaciente({ ...altaBase, telefono_paciente: telefono }, HOY),
      MENSAJE_TELEFONO
    );
  }
  assert.equal(
    validarAltaPaciente({ ...altaBase, fecha_nacimiento_paciente: "2026-09-26" }, HOY),
    "La fecha de nacimiento no puede ser futura"
  );
  assert.equal(
    validarAltaPaciente({ ...altaBase, fecha_nacimiento_paciente: "2026-02-30" }, HOY),
    "La fecha de nacimiento no es válida"
  );
});

test("edición: mismas reglas de nombre y teléfono", () => {
  const { dni_paciente, fecha_nacimiento_paciente, ...edicion } = altaBase;
  assert.equal(validarEdicionPaciente(edicion), null);
  assert.equal(validarEdicionPaciente({ ...edicion, nombre_paciente: "Ana1" }), MENSAJE_NOMBRE);
  assert.equal(validarEdicionPaciente({ ...edicion, telefono_paciente: "111" }), MENSAJE_TELEFONO);
});

test("obras: afiliado obligatorio y sin duplicar obra", () => {
  const base = {
    nombre_paciente: "Ana",
    apellido_paciente: "García",
    telefono_paciente: "3874209876",
    mail_paciente: "ana@mail.com",
    obras: [
      { id_obra_social: "a", numero_afiliado: "" },
    ],
  };

  assert.equal(
    validarEdicionPaciente(base),
    "El número de afiliado es obligatorio para cada obra social"
  );

  assert.equal(
    validarEdicionPaciente({
      ...base,
      obras: [
        { id_obra_social: "a", numero_afiliado: "1" },
        { id_obra_social: "a", numero_afiliado: "2" },
      ],
    }),
    "No se puede asociar la misma obra social dos veces"
  );
});

test("parsear obras desde FormData", () => {
  const form = new FormData();
  form.append("obra_social", "id-1");
  form.append("obra_social", "id-2");
  form.set("afiliado_id-1", "111");
  form.set("afiliado_id-2", "222");

  assert.deepEqual(parsearObrasFormulario(form), [
    { id_obra_social: "id-1", numero_afiliado: "111" },
    { id_obra_social: "id-2", numero_afiliado: "222" },
  ]);
});

test("esIdPaciente valida UUID", () => {
  assert.equal(esIdPaciente("3fa85f64-5717-4562-b3fc-2c963f66afa6"), true);
  assert.equal(esIdPaciente("no-es-uuid"), false);
});
