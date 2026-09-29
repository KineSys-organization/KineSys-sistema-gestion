import { esFechaValida, hoyArgentina } from "@/lib/atencion/validar";
import { DNI_OK, NOMBRE_OK, TELEFONO_OK } from "@/lib/profesionales/validar";

const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Mismos formatos que en el alta de profesionales: nombre y apellido solo letras,
// DNI de 7 u 8 números y teléfono de 10 números.
export const MENSAJE_NOMBRE = "El nombre solo puede tener letras";
export const MENSAJE_APELLIDO = "El apellido solo puede tener letras";
export const MENSAJE_DNI = "El DNI debe tener 7 u 8 números, sin puntos (ej.: 45774284)";
export const MENSAJE_TELEFONO =
  "El teléfono debe tener 10 números, con característica y sin 0 ni 15 (ej.: 3874209876)";

export type ObraFormulario = {
  id_obra_social: string;
  numero_afiliado: string;
};

export type CamposPaciente = {
  nombre_paciente: string;
  apellido_paciente: string;
  dni_paciente: string;
  fecha_nacimiento_paciente: string;
  telefono_paciente: string;
  mail_paciente: string;
  obras: ObraFormulario[];
};

export type CamposEdicionPaciente = Omit<
  CamposPaciente,
  "dni_paciente" | "fecha_nacimiento_paciente"
>;

function validarObras(obras: ObraFormulario[]): string | null {
  const vistos = new Set<string>();

  for (const obra of obras) {
    const id = obra.id_obra_social.trim();
    const afiliado = obra.numero_afiliado.trim();

    if (!id) return "Obra social inválida";
    if (vistos.has(id)) return "No se puede asociar la misma obra social dos veces";
    if (!afiliado) return "El número de afiliado es obligatorio para cada obra social";

    vistos.add(id);
  }

  return null;
}

export function parsearObrasFormulario(formData: FormData): ObraFormulario[] {
  const ids = formData.getAll("obra_social").map(String).filter(Boolean);
  const obras: ObraFormulario[] = [];

  for (const id of ids) {
    obras.push({
      id_obra_social: id,
      numero_afiliado: String(formData.get(`afiliado_${id}`) ?? ""),
    });
  }

  return obras;
}

// Lo que se valida igual en el alta y en la edición (nombre, apellido, teléfono y mail).
function validarContacto(input: CamposEdicionPaciente): string | null {
  if (!input.nombre_paciente.trim()) return "Faltan campos";
  if (!input.apellido_paciente.trim()) return "Faltan campos";
  if (!input.telefono_paciente.trim()) return "Faltan campos";
  if (!input.mail_paciente.trim()) return "Faltan campos";

  if (!NOMBRE_OK.test(input.nombre_paciente.trim())) return MENSAJE_NOMBRE;
  if (!NOMBRE_OK.test(input.apellido_paciente.trim())) return MENSAJE_APELLIDO;
  if (!TELEFONO_OK.test(input.telefono_paciente.trim())) return MENSAJE_TELEFONO;
  if (!MAIL_OK.test(input.mail_paciente.trim())) return "El mail no es válido";

  return null;
}

// `hoy` se puede pasar para los tests (por defecto, hoy en Argentina).
export function validarAltaPaciente(
  input: CamposPaciente,
  hoy: string = hoyArgentina()
): string | null {
  if (!input.dni_paciente.trim()) return "Faltan campos";
  if (!input.fecha_nacimiento_paciente.trim()) return "Faltan campos";

  const errorContacto = validarContacto(input);
  if (errorContacto) return errorContacto;

  if (!DNI_OK.test(input.dni_paciente.trim())) return MENSAJE_DNI;

  // Textos YYYY-MM-DD: compararlos ordena igual que las fechas.
  const nacimiento = input.fecha_nacimiento_paciente.trim();
  if (!esFechaValida(nacimiento)) return "La fecha de nacimiento no es válida";
  if (nacimiento > hoy) return "La fecha de nacimiento no puede ser futura";

  return validarObras(input.obras);
}

// DNI y fecha de nacimiento no se editan (HU-04).
export function validarEdicionPaciente(input: CamposEdicionPaciente): string | null {
  return validarContacto(input) ?? validarObras(input.obras);
}

export function esIdPaciente(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  );
}

// Otorgar turno → "Registrar paciente nuevo" → vuelve al paso del paciente.
// Solo se acepta volver a /turnos/nuevo (evita usar ?volver= para mandar a otro sitio).
// HU-28: el paso 1 puede no tener parámetros, así que "/turnos/nuevo" solo también vale.
export function urlVolverTurno(volver: string | null | undefined): string | null {
  const valor = (volver ?? "").trim();
  if (valor !== "/turnos/nuevo" && !valor.startsWith("/turnos/nuevo?")) return null;
  try {
    const url = new URL(valor, "http://kinesys.local");
    if (url.origin !== "http://kinesys.local" || url.pathname !== "/turnos/nuevo") return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

// Después del alta: la URL de regreso con el paciente nuevo ya elegido.
// Se arma con URLSearchParams (no pegando "&paciente=") porque el paso 1 puede no tener "?".
export function urlVolverConPaciente(volver: string, idPaciente: string): string {
  const url = new URL(volver, "http://kinesys.local");
  url.searchParams.set("paciente", idPaciente);
  return `${url.pathname}${url.search}`;
}

// Filtros del listado de pacientes. El rango etario va como "18-39" o "65-" (sin tope).
export const RANGOS_EDAD = [
  { valor: "0-17", etiqueta: "Menores (0 a 17)" },
  { valor: "18-39", etiqueta: "18 a 39" },
  { valor: "40-64", etiqueta: "40 a 64" },
  { valor: "65-", etiqueta: "65 o más" },
] as const;

export const OBRA_PARTICULAR = "particular";

export type FiltrosPacientes = {
  texto: string;
  obra: string | null; // null = todas; "particular"; o el uuid de la obra
  edadMin: number | null;
  edadMax: number | null;
};

const UUID_FILTRO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Lee los filtros de la URL. Lo que no es válido se ignora (no rompe la pantalla).
export function leerFiltrosPacientes(params: {
  q?: string;
  obra?: string;
  edad?: string;
}): FiltrosPacientes {
  const obra = (params.obra ?? "").trim();
  const rango = RANGOS_EDAD.find((r) => r.valor === (params.edad ?? "").trim());
  const [min, max] = rango ? rango.valor.split("-") : ["", ""];

  return {
    texto: (params.q ?? "").trim().slice(0, 100),
    obra: obra === OBRA_PARTICULAR || UUID_FILTRO.test(obra) ? obra : null,
    edadMin: min ? Number(min) : null,
    edadMax: max ? Number(max) : null,
  };
}
