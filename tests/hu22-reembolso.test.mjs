import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { puedeHacer } from "../src/lib/auth/permisos.ts";
import {
  AVISO_REEMBOLSO,
  etiquetaMotivoReembolso,
  formatearMomento,
  LARGO_MAXIMO_DETALLE_REEMBOLSO,
  leerFiltrosPagos,
  MOTIVOS_REEMBOLSO,
  mostrarBotonReembolso,
  OPCIONES_FILTRO_REEMBOLSO,
  puedeCorregirPago,
  urlPagos,
  validarReembolso,
} from "../src/lib/pagos/validar.ts";

// HU-22. Registrar el reembolso de un pago (HU-17: estado Reembolsado).
const base = { motivo: "pedido_paciente", detalle: "", medio: "efectivo" };

test("validación del reembolso: mismos mensajes que fn_registrar_reembolso", () => {
  assert.equal(validarReembolso(base), null);
  assert.equal(validarReembolso({ ...base, motivo: "" }), "Elegí el motivo del reembolso");
  assert.equal(validarReembolso({ ...base, motivo: "inventado" }), "Elegí el motivo del reembolso");
  assert.equal(
    validarReembolso({ ...base, detalle: "x".repeat(LARGO_MAXIMO_DETALLE_REEMBOLSO + 1) }),
    "El detalle no puede superar los 200 caracteres"
  );
  assert.equal(validarReembolso({ ...base, detalle: "x".repeat(200) }), null, "200 justos es válido");
  // Con Otro el detalle es obligatorio (solo espacios no cuenta).
  assert.equal(
    validarReembolso({ ...base, motivo: "otro", detalle: "   " }),
    "Indicá el detalle del reembolso cuando el motivo es Otro"
  );
  assert.equal(validarReembolso({ ...base, motivo: "otro", detalle: "Error de cobro" }), null);
  assert.equal(validarReembolso({ ...base, medio: "" }), "Elegí un medio de devolución válido");
  assert.equal(validarReembolso({ ...base, medio: "billetera" }), "Elegí un medio de devolución válido");
  for (const medio of ["efectivo", "transferencia", "debito", "credito"]) {
    assert.equal(validarReembolso({ ...base, medio }), null, medio);
  }
});

test("motivos: lista cerrada con sus etiquetas", () => {
  assert.deepEqual(
    MOTIVOS_REEMBOLSO.map((m) => m.valor),
    ["turno_cancelado", "pedido_paciente", "otro"]
  );
  assert.equal(etiquetaMotivoReembolso("turno_cancelado"), "Turno cancelado");
  assert.equal(etiquetaMotivoReembolso("pedido_paciente"), "Pedido del paciente");
  assert.equal(etiquetaMotivoReembolso("otro"), "Otro");
  assert.equal(etiquetaMotivoReembolso(null), "—");
});

test("botón Registrar reembolso: lo decide reembolsable (base) y el permiso del rol", () => {
  assert.equal(puedeHacer("Gerente", "pagos.reembolsar"), true);
  assert.equal(puedeHacer("Mesa de Entradas", "pagos.reembolsar"), true);
  assert.equal(puedeHacer("Profesional", "pagos.reembolsar"), false);

  assert.equal(mostrarBotonReembolso(true, "Gerente"), true);
  assert.equal(mostrarBotonReembolso(true, "Mesa de Entradas"), true);
  assert.equal(mostrarBotonReembolso(true, "Profesional"), false);
  assert.equal(mostrarBotonReembolso(true, null), false);
  // Sin pago o ya reembolsado: la base manda reembolsable = false.
  assert.equal(mostrarBotonReembolso(false, "Gerente"), false);
  assert.equal(mostrarBotonReembolso(false, "Mesa de Entradas"), false);
});

test("un pago reembolsado no se corrige; uno pagado sí", () => {
  assert.equal(puedeCorregirPago({ estado: "Pagado" }), true);
  assert.equal(puedeCorregirPago({ estado: "Reembolsado" }), false);
  assert.equal(puedeCorregirPago(null), false);
});

test("filtro de reembolso en /pagos: Todos / Con / Sin y se conserva al paginar", () => {
  assert.deepEqual(
    OPCIONES_FILTRO_REEMBOLSO.map((o) => o.etiqueta),
    ["Todos", "Con reembolso", "Sin reembolso"]
  );
  assert.equal(leerFiltrosPagos({}).reembolso, null);
  assert.equal(leerFiltrosPagos({ reembolso: "" }).reembolso, null);
  assert.equal(leerFiltrosPagos({ reembolso: "con" }).reembolso, "con");
  assert.equal(leerFiltrosPagos({ reembolso: "sin" }).reembolso, "sin");
  assert.equal(leerFiltrosPagos({ reembolso: "cualquiera" }).reembolso, null);

  const filtros = leerFiltrosPagos({ q: "ana", desde: "2026-10-01", reembolso: "con" });
  assert.equal(urlPagos(filtros, 2), "/pagos?q=ana&desde=2026-10-01&reembolso=con&pagina=2");
  assert.equal(urlPagos(leerFiltrosPagos({ reembolso: "sin" })), "/pagos?reembolso=sin");
});

test("fecha del reembolso en hora de Argentina", () => {
  // 18:05 UTC = 15:05 en Buenos Aires.
  // El formato exacto (24 h o "p. m.") depende de los datos de idioma de Node.
  const texto = formatearMomento("2026-10-13T18:05:00+00:00");
  assert.match(texto, /13\/10/);
  assert.match(texto, /\b(15|3):05/);
  assert.doesNotMatch(texto, /\b(18|6):05/);
});

// --- Chequeos sobre el código (front: solo valida e invoca la función) ---

const leer = (ruta) => readFileSync(ruta, "utf8");
const acciones = leer("src/lib/pagos/actions.ts");
const formulario = leer("src/components/pagos/ReembolsoForm.tsx");
const paginaPago = leer("src/app/(main)/turnos/[id]/pago/page.tsx");
const paginaPagos = leer("src/app/(main)/pagos/page.tsx");
const paginaTurno = leer("src/app/(main)/turnos/[id]/page.tsx");

test("server action: permiso, validación y RPC fn_registrar_reembolso", () => {
  const cuerpo = acciones.slice(acciones.indexOf("export async function registrarReembolso"));
  assert.match(cuerpo, /exigirAccion\("pagos\.reembolsar"\)/);
  assert.match(cuerpo, /validarReembolso\(/);
  assert.match(cuerpo, /rpc\("fn_registrar_reembolso", \{\s*p_id_turno[\s\S]*p_motivo[\s\S]*p_detalle[\s\S]*p_medio/);
  assert.match(cuerpo, /error\.message/);
  assert.match(acciones, /p_reembolso: filtros\.reembolso/);
  for (const fuente of [acciones, formulario, paginaPago, paginaPagos]) {
    assert.doesNotMatch(fuente, /supabase\.from\(|\.from\("/);
  }
});

test("formulario: resumen, confirmación, aviso fijo y botón deshabilitado al enviar", () => {
  assert.match(formulario, /Registrar reembolso/);
  assert.match(formulario, /Revisar reembolso/);
  assert.match(formulario, /Confirmar reembolso/);
  assert.match(formulario, /no se deshace/);
  assert.match(formulario, /disabled=\{pending\}/);
  assert.match(formulario, /AVISO_REEMBOLSO/);
  assert.match(formulario, /LARGO_MAXIMO_DETALLE_REEMBOLSO/);
  assert.match(AVISO_REEMBOLSO, /billetera virtual/);
});

test("detalle del pago: estado Reembolsado, bloque del reembolso y sin Corregir", () => {
  assert.match(paginaPago, /<EstadoPagoBadge estado=\{pago\.estado\}/);
  assert.match(paginaPago, /mostrarBotonReembolso\(reembolsable, usuario\.rol_usuario\)/);
  assert.match(paginaPago, /<ReembolsoForm/);
  assert.match(paginaPago, /formatearMomento\(reembolso\.registrado_en\)/);
  assert.match(paginaPago, /reembolso\.registrado_por/);
  assert.match(paginaPago, /\{corregible && \(/);
  assert.match(paginaPago, /corregir && corregible/);
  assert.match(paginaTurno, /puedeCorregirPago\(detallePago\.pago\)/);
});

test("listado /pagos: columna Estado, datos del reembolso y filtro", () => {
  assert.match(paginaPagos, /<th>Estado<\/th>/);
  assert.match(paginaPagos, /<EstadoPagoBadge estado=\{pago\.estado_pago\}/);
  assert.match(paginaPagos, /pago\.reembolso\.registrado_en/);
  assert.match(paginaPagos, /pago\.reembolso\.motivo/);
  assert.match(paginaPagos, /pago\.reembolso\.importe/);
  assert.match(paginaPagos, /name="reembolso"/);
});
