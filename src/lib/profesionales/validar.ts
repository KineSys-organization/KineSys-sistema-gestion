const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarAltaProfesional(input: {
  email: string;
  password: string;
  nombre_usuario: string;
  apellido_usuario: string;
  fecha_nacimiento_usuario: string;
  dni_usuario: string;
  telefono_usuario: string;
  matricula: string;
  servicios: string[];
}): string | null {
  if (!input.email.trim()) return "Faltan campos";
  if (!MAIL_OK.test(input.email.trim())) return "El mail no es válido";
  if (!input.password) return "Faltan campos";
  if (input.password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!input.nombre_usuario.trim()) return "Faltan campos";
  if (!input.apellido_usuario.trim()) return "Faltan campos";
  if (!input.fecha_nacimiento_usuario.trim()) return "Faltan campos";
  if (!input.telefono_usuario.trim()) return "Faltan campos";
  if (!input.matricula.trim()) return "Faltan campos";

  const dni = Number(input.dni_usuario);
  if (!Number.isInteger(dni) || dni <= 0) return "El DNI debe ser un número entero mayor a cero";

  if (input.servicios.length === 0) {
    return "Un profesional debe tener al menos un servicio asociado";
  }

  return null;
}

export function validarEdicionProfesional(input: {
  nombre_usuario: string;
  apellido_usuario: string;
  fecha_nacimiento_usuario: string;
  dni_usuario: string;
  telefono_usuario: string;
  matricula: string;
  servicios: string[];
}): string | null {
  if (!input.nombre_usuario.trim()) return "Faltan campos";
  if (!input.apellido_usuario.trim()) return "Faltan campos";
  if (!input.fecha_nacimiento_usuario.trim()) return "Faltan campos";
  if (!input.telefono_usuario.trim()) return "Faltan campos";
  if (!input.matricula.trim()) return "Faltan campos";

  const dni = Number(input.dni_usuario);
  if (!Number.isInteger(dni) || dni <= 0) return "El DNI debe ser un número entero mayor a cero";

  return null;
}
