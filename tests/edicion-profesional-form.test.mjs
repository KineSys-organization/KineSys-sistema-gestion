import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// tsx usa JSX clásico fuera de Next; Next configura el runtime automático.
globalThis.React = React;
const { EdicionProfesionalForm } = await import('../src/components/profesionales/EdicionProfesionalForm.tsx');
const { TurnosAfectados } = await import('../src/components/profesionales/TurnosAfectados.tsx');
const base = {
  id_usuario: '00000000-0000-4000-8000-000000000001',
  nombre_usuario: 'Ana', apellido_usuario: 'Fernández', fecha_nacimiento_usuario: '1990-05-12',
  dni_usuario: 35000111, telefono_usuario: '1144445555', mail_usuario: 'ana@example.com',
  matricula: 'MN-123', activo: true, servicios: ['evaluacion', 'kine'],
};
const servicios = [
  { id_servicio: 'evaluacion', nombre_servicio: 'Evaluación inicial', activo: true },
  { id_servicio: 'kine', nombre_servicio: 'Kinesiología', activo: true },
  { id_servicio: 'otro', nombre_servicio: 'Otro servicio', activo: true },
];
function input(html, nombre) { return html.match(new RegExp('<input[^>]*name="'+nombre+'"[^>]*>'))?.[0] ?? ''; }
function checkbox(html, id) { return html.match(new RegExp('<input[^>]*value="'+id+'"[^>]*>'))?.[0] ?? ''; }

test('Editar muestra los datos actuales y marca solo los servicios guardados', () => {
  const html = renderToStaticMarkup(React.createElement(EdicionProfesionalForm, { profesional: base, servicios }));
  for (const [campo, valor] of Object.entries({email: base.mail_usuario, nombre_usuario: base.nombre_usuario,
    apellido_usuario: base.apellido_usuario, fecha_nacimiento_usuario: base.fecha_nacimiento_usuario,
    dni_usuario: base.dni_usuario, telefono_usuario: base.telefono_usuario, matricula: base.matricula})) {
    assert.ok(input(html,campo).includes('value="'+valor+'"'), campo+' debe estar precargado');
  }
  assert.match(input(html,'email'), /readOnly=""/);
  assert.match(checkbox(html,'evaluacion'), /checked=""/);
  assert.match(checkbox(html,'kine'), /checked=""/);
  assert.doesNotMatch(checkbox(html,'otro'), /checked=/);
});

test('Al reabrir con otra selección usa la última actualización y conserva servicios inactivos asociados', () => {
  const html = renderToStaticMarkup(React.createElement(EdicionProfesionalForm, {
    profesional: {...base, nombre_usuario:'Actualizado', servicios:['otro']},
    servicios: servicios.map(s=>({...s,activo:s.id_servicio!=='otro'})),
  }));
  assert.match(input(html,'nombre_usuario'), /value="Actualizado"/);
  assert.match(checkbox(html,'otro'), /checked=""/);
  assert.doesNotMatch(checkbox(html,'evaluacion'), /checked=/);
  assert.match(html, /Otro servicio \(inactivo\)/);
});

test('El aviso posterior muestra los turnos conservados y su detalle para Recepción', () => {
  const html = renderToStaticMarkup(React.createElement(TurnosAfectados, { guardado:true,turnos:[{
    id_turno:base.id_usuario, fecha:'2026-09-28',hora_inicio:'16:00',hora_fin:'17:00',paciente:'Paciente de prueba',
    dni_paciente:35000123, servicio:'Evaluación inicial', estado:'confirmado',
  }]}));
  assert.match(html,/Cambio guardado/);
  assert.match(html,/Siguen confirmados, sin modificaciones ni cancelaciones/);
  assert.match(html,/16:00–17:00/);
  assert.match(html,/Paciente de prueba/);
  assert.ok(html.includes('/turnos/'+base.id_usuario));
});
