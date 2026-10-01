import assert from "node:assert/strict";
import test from "node:test";
import { validarAltaUsuarioGestion } from "../src/lib/usuarios-gestion/validar.ts";

const valido = {
  email: "gerente@example.com",
  password: "clave-segura",
  nombre_usuario: "María José",
  apellido_usuario: "Pérez-Gil",
  fecha_nacimiento_usuario: "1990-05-12",
  dni_usuario: "30123456",
  telefono_usuario: "3874209876",
  rol_usuario: "Gerente",
};

test("valida un usuario de gestión válido", () => {
  assert.equal(validarAltaUsuarioGestion(valido, "2026-10-01"), null);
});

test("rechaza mail inválido, DNI no numérico y roles fuera de alcance", () => {
  assert.equal(validarAltaUsuarioGestion({ ...valido, email: "sin-arroba" }, "2026-10-01"), "El mail no es válido");
  assert.equal(validarAltaUsuarioGestion({ ...valido, dni_usuario: "30.123.456" }, "2026-10-01"), "El DNI debe tener 7 u 8 números, sin puntos");
  assert.equal(validarAltaUsuarioGestion({ ...valido, rol_usuario: "Profesional" }, "2026-10-01"), "El rol seleccionado no es válido");
});

test("rechaza usuarios menores de 18 años", () => {
  assert.equal(validarAltaUsuarioGestion({ ...valido, fecha_nacimiento_usuario: "2008-10-02" }, "2026-10-01"), "El usuario debe tener al menos 18 años");
});
