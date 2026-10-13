import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("HU-34: acción de estado usa permiso y RPC, sin acceso directo a tablas", () => {
  const action = leer("../src/lib/pacientes/actions.ts");
  const fn = action.slice(action.indexOf("export async function cambiarEstadoPaciente"));
  assert.match(fn, /exigirAccion\("pacientes\.gestionar"\)/);
  assert.match(fn, /rpc\("fn_cambiar_estado_paciente"/);
  assert.match(fn, /p_activo: activo/);
  assert.doesNotMatch(fn, /supabase\.from\(/);
});

test("HU-34: el filtro de estado viaja por RPC y la ficha pide los turnos futuros", () => {
  const action = leer("../src/lib/pacientes/actions.ts");
  const list = action.slice(action.indexOf("export async function filtrarPacientes"), action.indexOf("export async function editarPaciente"));
  assert.match(list, /p_estado: filtros\.estado/);

  const migration = leer("../supabase/migrations/20261013034240_hu34_estado_paciente.sql");
  assert.match(migration, /p_estado text default 'activos'/);
  assert.match(migration, /p\.activo = \(v_estado = 'activos'\)/);
  assert.match(migration, /'turnos_confirmados_futuros'/);
  assert.match(migration, /t\.estado = 'confirmado'/);
  assert.match(migration, /fn_es_recepcion\(\)/);
});

test("HU-34: ficha confirma antes del cambio y enumera los turnos a futuro", () => {
  const component = leer("../src/components/pacientes/EstadoPacienteForm.tsx");
  assert.match(component, /Confirmar \$\{paciente\.activo \? "desactivación" : "activación"\}/);
  assert.match(component, /Turnos confirmados a futuro/);
  assert.match(component, /turno\.fecha/);
  assert.match(component, /turno\.hora_inicio/);
  assert.match(component, /turno\.nombre_profesional/);
  assert.match(component, /turno\.nombre_servicio/);
});
