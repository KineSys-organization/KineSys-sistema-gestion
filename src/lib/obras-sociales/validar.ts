const UUID_OK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validarNombreObraSocial(nombre: string): string | null {
  const limpio = nombre.trim();
  if (!limpio) return "El nombre de la obra social es obligatorio";
  const longitud = [...limpio].length;
  if (longitud < 2 || longitud > 80) {
    return "El nombre debe tener entre 2 y 80 caracteres";
  }
  return null;
}

export function esIdObraSocial(id: string): boolean {
  return UUID_OK.test(id.trim());
}
