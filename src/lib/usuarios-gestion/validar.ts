import { esFechaValida, hoyArgentina } from "@/lib/atencion/validar";
import { DNI_OK, NOMBRE_OK, TELEFONO_OK, fechaNacimientoMaxima } from "@/lib/profesionales/validar";
import type { RolGestionInterno } from "./tipos";

const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type DatosUsuarioGestion = {
  email: string;
  password: string;
  nombre_usuario: string;
  apellido_usuario: string;
  fecha_nacimiento_usuario: string;
  dni_usuario: string;
  telefono_usuario: string;
  rol_usuario: string;
};

export function validarAltaUsuarioGestion(
  datos: DatosUsuarioGestion,
  hoy: string = hoyArgentina()
): string | null {
  if (
    !datos.email.trim() || !datos.password || !datos.nombre_usuario.trim() ||
    !datos.apellido_usuario.trim() || !datos.fecha_nacimiento_usuario.trim() ||
    !datos.dni_usuario.trim() || !datos.telefono_usuario.trim() || !datos.rol_usuario
  ) return "Completá todos los campos";
  if (!MAIL_OK.test(datos.email.trim())) return "El mail no es válido";
  if (datos.password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!NOMBRE_OK.test(datos.nombre_usuario.trim())) return "El nombre solo puede tener letras";
  if (!NOMBRE_OK.test(datos.apellido_usuario.trim())) return "El apellido solo puede tener letras";
  if (!DNI_OK.test(datos.dni_usuario.trim())) return "El DNI debe tener 7 u 8 números, sin puntos";
  if (!TELEFONO_OK.test(datos.telefono_usuario.trim())) return "El teléfono debe tener 10 números";
  if (!esFechaValida(datos.fecha_nacimiento_usuario.trim())) return "La fecha de nacimiento no es válida";
  if (datos.fecha_nacimiento_usuario.trim() > fechaNacimientoMaxima(hoy)) {
    return "El usuario debe tener al menos 18 años";
  }
  const rolesPermitidos: RolGestionInterno[] = ["Gerente", "Mesa de Entradas"];
  if (!rolesPermitidos.includes(datos.rol_usuario as RolGestionInterno)) {
    return "El rol seleccionado no es válido";
  }
  return null;
}
