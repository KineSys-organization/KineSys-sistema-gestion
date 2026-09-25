import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MENSAJE_APELLIDO,
  MENSAJE_DNI,
  MENSAJE_EDAD_MINIMA,
  MENSAJE_FECHA_NACIMIENTO,
  MENSAJE_NOMBRE,
  MENSAJE_TELEFONO,
  validarAltaProfesional,
  fechaNacimientoMaxima,
  validarEdicionProfesional,
} from '../src/lib/profesionales/validar.ts';

// Alta de profesional: formato de nombre, apellido, DNI y teléfono.
const altaValida = {
  email: 'ana.garcia@gmail.com',
  password: 'clave1234',
  nombre_usuario: 'Ana',
  apellido_usuario: 'García',
  fecha_nacimiento_usuario: '1990-04-20',
  dni_usuario: '45774284',
  telefono_usuario: '3874209876',
  matricula: 'MN-9988',
  servicios: ['00000000-0000-4000-8000-000000000001'],
};

test('alta: acepta datos completos y con formato correcto', () => {
  assert.equal(validarAltaProfesional(altaValida), null);
});

test('alta: nombre y apellido aceptan acentos, ñ, espacios, guion y apóstrofo', () => {
  for (const nombre of ['María José', 'Ñandú', 'Zoë', 'Pérez-Gil', "D'Angelo", '  Ana  ']) {
    assert.equal(validarAltaProfesional({ ...altaValida, nombre_usuario: nombre }), null, nombre);
    assert.equal(validarAltaProfesional({ ...altaValida, apellido_usuario: nombre }), null, nombre);
  }
});

test('alta: nombre con números o símbolos se rechaza', () => {
  for (const nombre of ['Ana2', '123', 'Ana_Maria', 'Ana.', 'Ana  María', '-Ana', 'Ana@']) {
    assert.equal(validarAltaProfesional({ ...altaValida, nombre_usuario: nombre }), MENSAJE_NOMBRE, nombre);
  }
});

test('alta: apellido con números o símbolos se rechaza', () => {
  for (const apellido of ['García1', '4567', 'Gar#cía']) {
    assert.equal(validarAltaProfesional({ ...altaValida, apellido_usuario: apellido }), MENSAJE_APELLIDO, apellido);
  }
});

test('alta: DNI de 7 u 8 números, sin puntos', () => {
  for (const dni of ['45774284', '4577428', ' 45774284 ']) {
    assert.equal(validarAltaProfesional({ ...altaValida, dni_usuario: dni }), null, dni);
  }
  for (const dni of ['45.774.284', '457742', '457742840', '4577428a', '-4577428', '4577428.5']) {
    assert.equal(validarAltaProfesional({ ...altaValida, dni_usuario: dni }), MENSAJE_DNI, dni);
  }
});

test('alta: teléfono de 10 números, sin 0 ni 15 adelante', () => {
  assert.equal(validarAltaProfesional({ ...altaValida, telefono_usuario: '1123456789' }), null);
  for (const tel of ['387-4209876', '387 4209876', '03874209876', '4209876', '+543874209876', '387420987a']) {
    assert.equal(validarAltaProfesional({ ...altaValida, telefono_usuario: tel }), MENSAJE_TELEFONO, tel);
  }
});

test('alta: un campo vacío sigue dando "Faltan campos"', () => {
  for (const campo of ['nombre_usuario', 'apellido_usuario', 'dni_usuario', 'telefono_usuario', 'matricula']) {
    assert.equal(validarAltaProfesional({ ...altaValida, [campo]: '  ' }), 'Faltan campos', campo);
  }
});

test('edición: aplica las mismas reglas de formato', () => {
  const { email, password, ...edicion } = altaValida;
  assert.equal(validarEdicionProfesional(edicion), null);
  assert.equal(validarEdicionProfesional({ ...edicion, nombre_usuario: 'Ana2' }), MENSAJE_NOMBRE);
  assert.equal(validarEdicionProfesional({ ...edicion, dni_usuario: '45.774.284' }), MENSAJE_DNI);
  assert.equal(validarEdicionProfesional({ ...edicion, telefono_usuario: '387-4209876' }), MENSAJE_TELEFONO);
});

// Edad mínima: 18 años cumplidos. Se fija "hoy" para que el test no dependa de la fecha real.
const HOY = '2026-09-24';

test('edad: con 18 años cumplidos (incluso el mismo día) se acepta', () => {
  for (const fecha of ['2008-09-24', '2008-09-23', '1990-04-20', '1950-01-01']) {
    assert.equal(validarAltaProfesional({ ...altaValida, fecha_nacimiento_usuario: fecha }, HOY), null, fecha);
  }
});

test('edad: menor de 18 (aunque sea por un día) se rechaza', () => {
  for (const fecha of ['2008-09-25', '2010-01-01', '2026-09-24', '2030-01-01']) {
    assert.equal(
      validarAltaProfesional({ ...altaValida, fecha_nacimiento_usuario: fecha }, HOY),
      MENSAJE_EDAD_MINIMA,
      fecha
    );
  }
});

test('edad: fecha inexistente o mal escrita se rechaza', () => {
  for (const fecha of ['2000-02-30', '20/04/1990', '1990-4-20', 'ayer']) {
    assert.equal(
      validarAltaProfesional({ ...altaValida, fecha_nacimiento_usuario: fecha }, HOY),
      MENSAJE_FECHA_NACIMIENTO,
      fecha
    );
  }
});

test('edad: la edición aplica la misma regla y el tope del calendario es hoy menos 18 años', () => {
  const { email, password, ...edicion } = altaValida;
  assert.equal(validarEdicionProfesional({ ...edicion, fecha_nacimiento_usuario: '2009-01-01' }, HOY), MENSAJE_EDAD_MINIMA);
  assert.equal(fechaNacimientoMaxima(HOY), '2008-09-24');
});
