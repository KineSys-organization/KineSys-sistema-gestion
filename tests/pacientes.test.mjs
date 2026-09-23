import assert from "node:assert/strict";
import test from "node:test";
import {
  esIdPaciente,
  parsearObrasFormulario,
  validarAltaPaciente,
  validarEdicionPaciente,
} from "../src/lib/pacientes/validar.ts";

test("alta: exige campos básicos y DNI positivo", () => {
  const base = {
    nombre_paciente: "Ana",
    apellido_paciente: "García",
    dni_paciente: "30111222",
    fecha_nacimiento_paciente: "1990-05-10",
    telefono_paciente: "111",
    mail_paciente: "ana@mail.com",
    obras: [],
  };

  assert.equal(validarAltaPaciente({ ...base, nombre_paciente: "" }), "Faltan campos");
  assert.equal(validarAltaPaciente({ ...base, dni_paciente: "0" }), "El DNI debe ser un número entero mayor a cero");
  assert.equal(validarAltaPaciente({ ...base, mail_paciente: "malo" }), "El mail no es válido");
  assert.equal(validarAltaPaciente(base), null);
});

test("obras: afiliado obligatorio y sin duplicar obra", () => {
  const base = {
    nombre_paciente: "Ana",
    apellido_paciente: "García",
    telefono_paciente: "111",
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
