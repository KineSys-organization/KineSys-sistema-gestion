import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validarEdicionProfesional } from '../src/lib/profesionales/validar.ts';

const datosValidos = {
  nombre_usuario: 'Ana',
  apellido_usuario: 'García',
  fecha_nacimiento_usuario: '1990-04-20',
  dni_usuario: '35123456',
  telefono_usuario: '1123456789',
  matricula: 'MN-9988',
  servicios: ['00000000-0000-4000-8000-000000000001'],
};

test('acepta datos de edición completos y válidos', () => {
  assert.equal(validarEdicionProfesional(datosValidos), null);
});

test('rechaza campos obligatorios vacíos', () => {
  for (const campo of ['nombre_usuario', 'apellido_usuario', 'fecha_nacimiento_usuario', 'telefono_usuario', 'matricula']) {
    const copia = { ...datosValidos, [campo]: '   ' };
    assert.equal(validarEdicionProfesional(copia), 'Faltan campos');
  }
});

test('rechaza DNI no entero o menor o igual a cero', () => {
  for (const dni of ['0', '-5', 'abc', '12.34', '']) {
    const copia = { ...datosValidos, dni_usuario: dni };
    assert.equal(validarEdicionProfesional(copia), 'El DNI debe ser un número entero mayor a cero');
  }
});

test('permite enviar una lista vacía para que la base valide turnos y pida confirmación', () => {
  const copia = { ...datosValidos, servicios: [] };
  assert.equal(validarEdicionProfesional(copia), null);
});
