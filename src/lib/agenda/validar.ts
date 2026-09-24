const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validarConsultaAgenda(input: {
  id_profesional: string;
  fecha: string;
}): string | null {
  if (!input.id_profesional.trim()) return "Elegí un profesional";
  if (!UUID_OK.test(input.id_profesional.trim())) return "Profesional inválido";
  if (!input.fecha.trim()) return "Elegí una fecha";

  const fecha = new Date(`${input.fecha}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return "La fecha no es válida";

  return null;
}
