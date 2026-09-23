const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validarConsultaDisponibilidad(input: {
  id_profesional: string;
  id_servicio: string;
  fecha: string;
}): string | null {
  if (!input.id_profesional.trim()) return "Elegí un profesional";
  if (!UUID_OK.test(input.id_profesional.trim())) return "Profesional inválido";
  if (!input.id_servicio.trim()) return "Elegí un servicio";
  if (!UUID_OK.test(input.id_servicio.trim())) return "Servicio inválido";
  if (!input.fecha.trim()) return "Elegí una fecha";

  const fecha = new Date(`${input.fecha}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return "La fecha no es válida";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fecha < hoy) return "No se puede consultar una fecha pasada";

  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + 30);
  if (fecha > limite) {
    return "Solo se puede consultar disponibilidad hasta 30 días desde hoy";
  }

  return null;
}

export function fechaMaximaConsulta(): string {
  const limite = new Date();
  limite.setHours(0, 0, 0, 0);
  limite.setDate(limite.getDate() + 30);
  return limite.toISOString().slice(0, 10);
}

export function fechaMinimaConsulta(): string {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy.toISOString().slice(0, 10);
}
