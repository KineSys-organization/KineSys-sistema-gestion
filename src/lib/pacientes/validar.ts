const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

export function validarAltaPaciente(input: CamposPaciente): string | null {
  if (!input.nombre_paciente.trim()) return "Faltan campos";
  if (!input.apellido_paciente.trim()) return "Faltan campos";
  if (!input.fecha_nacimiento_paciente.trim()) return "Faltan campos";
  if (!input.telefono_paciente.trim()) return "Faltan campos";
  if (!input.mail_paciente.trim()) return "Faltan campos";
  if (!MAIL_OK.test(input.mail_paciente.trim())) return "El mail no es válido";

  const dni = Number(input.dni_paciente);
  if (!Number.isInteger(dni) || dni <= 0) {
    return "El DNI debe ser un número entero mayor a cero";
  }

  const nacimiento = new Date(`${input.fecha_nacimiento_paciente}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "La fecha de nacimiento no es válida";
  if (nacimiento > new Date()) return "La fecha de nacimiento no puede ser futura";

  return validarObras(input.obras);
}

export function validarEdicionPaciente(input: CamposEdicionPaciente): string | null {
  if (!input.nombre_paciente.trim()) return "Faltan campos";
  if (!input.apellido_paciente.trim()) return "Faltan campos";
  if (!input.telefono_paciente.trim()) return "Faltan campos";
  if (!input.mail_paciente.trim()) return "Faltan campos";
  if (!MAIL_OK.test(input.mail_paciente.trim())) return "El mail no es válido";

  return validarObras(input.obras);
}

export function esIdPaciente(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  );
}
