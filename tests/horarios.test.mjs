import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIAS_LUNES_A_VIERNES,
  DIAS_TODOS,
  esIdProfesional,
  validarCamposFranja,
  validarCamposFranjas,
} from '../src/lib/profesionales/horarios.ts';

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

// Alta en varios días (migración 012).
test('varios días: acepta lunes a viernes, todos o algunos sueltos', () => {
  for (const dias of [['1', '2', '3', '4', '5'], ['1', '2', '3', '4', '5', '6', '7'], ['2', '4'], ['6']]) {
    assert.equal(validarCamposFranjas({ dias, hora_inicio: '09:00', hora_fin: '12:00' }), null, dias.join(','));
  }
});
test('varios días: exige al menos un día y que todos sean válidos', () => {
  assert.equal(
    validarCamposFranjas({ dias: [], hora_inicio: '09:00', hora_fin: '12:00' }),
    'Seleccioná al menos un día de la semana'
  );
  for (const dias of [['1', '8'], ['0'], ['lunes'], ['1', '']]) {
    assert.equal(
      validarCamposFranjas({ dias, hora_inicio: '09:00', hora_fin: '12:00' }),
      'Seleccioná un día de la semana válido',
      dias.join(',')
    );
  }
});
test('varios días: rechaza horarios incompletos y fuera del reloj', () => {
  for (const hora of ['', '9:00', '24:00', '12:60']) {
    assert.ok(validarCamposFranjas({ dias: ['1'], hora_inicio: hora, hora_fin: '12:00' }));
    assert.ok(validarCamposFranjas({ dias: ['1'], hora_inicio: '09:00', hora_fin: hora }));
  }
});
test('atajos: lunes a viernes son 1..5 y todos son 1..7', () => {
  assert.deepEqual(DIAS_LUNES_A_VIERNES, [1, 2, 3, 4, 5]);
  assert.deepEqual(DIAS_TODOS, [1, 2, 3, 4, 5, 6, 7]);
});
