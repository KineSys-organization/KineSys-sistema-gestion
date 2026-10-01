export function validarNombreObraSocial(nombre: string): string | null {
  const limpio = nombre.trim();
  if (!limpio) return "El nombre de la obra social es obligatorio";
  const longitud = [...limpio].length;
  if (longitud < 2 || longitud > 80) {
    return "El nombre debe tener entre 2 y 80 caracteres";
  }
  return null;
}
