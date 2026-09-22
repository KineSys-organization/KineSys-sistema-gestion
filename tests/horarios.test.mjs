import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esIdProfesional, validarCamposFranja } from '../src/lib/profesionales/horarios.ts';

test('acepta días 1 a 7 y extremos válidos del reloj', () => {
  for (let dia = 1; dia <= 7; dia++) {
    assert.equal(validarCamposFranja({ dia_semana: String(dia), hora_inicio: '00:00', hora_fin: '23:59' }), null);
  }
});
test('rechaza días faltantes o inválidos', () => {
  for (const dia of ['', '0', '8', '1.5', 'lunes']) {
    assert.ok(validarCamposFranja({ dia_semana: dia, hora_inicio: '09:00', hora_fin: '12:00' }));
  }
});
test('rechaza horarios incompletos y fuera del reloj', () => {
  for (const hora of ['', '9:00', '24:00', '12:60', '12:30:00']) {
    assert.ok(validarCamposFranja({ dia_semana: '1', hora_inicio: hora, hora_fin: '12:00' }));
    assert.ok(validarCamposFranja({ dia_semana: '1', hora_inicio: '09:00', hora_fin: hora }));
  }
});
test('rechaza identificadores inválidos antes de llamar a Supabase', () => {
  assert.equal(esIdProfesional('no-existe'), false);
  assert.equal(esIdProfesional(''), false);
  assert.equal(esIdProfesional('00000000-0000-4000-8000-000000000001'), true);
});
