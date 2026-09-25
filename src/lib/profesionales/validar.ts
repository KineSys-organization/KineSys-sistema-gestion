import { esFechaValida, hoyArgentina } from "@/lib/atencion/validar";

const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Solo letras (con acentos y ñ). Permite espacio, guion o apóstrofo entre palabras:
// "María José", "Pérez-Gil", "D'Angelo". No acepta números ni símbolos.
export const NOMBRE_OK = /^\p{L}+(?:[ '-]\p{L}+)*$/u;

// DNI argentino: 7 u 8 números, sin puntos (ej.: 45774284).
export const DNI_OK = /^\d{7,8}$/;

// Teléfono: 10 números con la característica, sin 0 ni 15 (ej.: 3874209876).
export const TELEFONO_OK = /^\d{10}$/;

export const MENSAJE_NOMBRE = "El nombre solo puede tener letras";
export const MENSAJE_APELLIDO = "El apellido solo puede tener letras";
export const MENSAJE_DNI = "El DNI debe tener 7 u 8 números, sin puntos (ej.: 45774284)";
export const MENSAJE_TELEFONO =
  "El teléfono debe tener 10 números, con característica y sin 0 ni 15 (ej.: 3874209876)";
export const EDAD_MINIMA = 18;
export const MENSAJE_FECHA_NACIMIENTO = "La fecha de nacimiento no es válida";
export const MENSAJE_EDAD_MINIMA = `El profesional debe tener al menos ${EDAD_MINIMA} años`;

// Última fecha de nacimiento posible para tener la edad mínima hoy: "2026-09-24" -> "2008-09-24".
// Comparar textos YYYY-MM-DD sirve porque ordenan igual que las fechas.
export function fechaNacimientoMaxima(hoy: string = hoyArgentina()): string {
  return `${Number(hoy.slice(0, 4)) - EDAD_MINIMA}${hoy.slice(4)}`;
}

type DatosPersonales = {
  nombre_usuario: string;
  apellido_usuario: string;
  fecha_nacimiento_usuario: string;
  dni_usuario: string;
  telefono_usuario: string;
  matricula: string;
};

// Mismas reglas para el alta y la edición: obligatorios, formato de nombre, DNI y teléfono,
// y edad mínima. `hoy` se puede pasar para los tests (por defecto, hoy en Argentina).
function validarDatosPersonales(input: DatosPersonales, hoy: string): string | null {
  if (!input.nombre_usuario.trim()) return "Faltan campos";
  if (!input.apellido_usuario.trim()) return "Faltan campos";
  if (!input.fecha_nacimiento_usuario.trim()) return "Faltan campos";
  if (!input.dni_usuario.trim()) return "Faltan campos";
  if (!input.telefono_usuario.trim()) return "Faltan campos";
  if (!input.matricula.trim()) return "Faltan campos";

  if (!NOMBRE_OK.test(input.nombre_usuario.trim())) return MENSAJE_NOMBRE;
  if (!NOMBRE_OK.test(input.apellido_usuario.trim())) return MENSAJE_APELLIDO;
  if (!DNI_OK.test(input.dni_usuario.trim())) return MENSAJE_DNI;
  if (!TELEFONO_OK.test(input.telefono_usuario.trim())) return MENSAJE_TELEFONO;

  const nacimiento = input.fecha_nacimiento_usuario.trim();
  if (!esFechaValida(nacimiento)) return MENSAJE_FECHA_NACIMIENTO;
  if (nacimiento > fechaNacimientoMaxima(hoy)) return MENSAJE_EDAD_MINIMA;

  return null;
}

export function validarAltaProfesional(input: DatosPersonales & {
  email: string;
  password: string;
  servicios: string[];
}, hoy: string = hoyArgentina()): string | null {
  if (!input.email.trim()) return "Faltan campos";
  if (!MAIL_OK.test(input.email.trim())) return "El mail no es válido";
  if (!input.password) return "Faltan campos";
  if (input.password.length < 8) return "La contraseña debe tener al menos 8 caracteres";

  const errorDatos = validarDatosPersonales(input, hoy);
  if (errorDatos) return errorDatos;

  if (input.servicios.length === 0) {
    return "Un profesional debe tener al menos un servicio asociado";
  }

  return null;
}

export function validarEdicionProfesional(input: DatosPersonales & {
  servicios: string[];
}, hoy: string = hoyArgentina()): string | null {
  return validarDatosPersonales(input, hoy);
}
