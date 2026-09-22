export function validarServicio(input: {
  nombre: string;
  duracion: string;
  granularidad: string;
  precio: string;
}): string | null {
  if (!input.nombre.trim()) return "El nombre del servicio es obligatorio";

  const duracion = Number(input.duracion);
  if (!Number.isInteger(duracion) || duracion <= 0) {
    return "La duración es obligatoria y debe ser mayor a cero";
  }

  const granularidad = Number(input.granularidad);
  if (!Number.isInteger(granularidad) || granularidad <= 0) {
    return "La granularidad es obligatoria y debe ser mayor a cero";
  }

  const precioTexto = input.precio.trim();
  if (precioTexto) {
    const precio = Number(precioTexto);
    if (!Number.isFinite(precio) || precio < 0) {
      return "El precio, si se carga, debe ser un número mayor o igual a cero";
    }
  }

  return null;
}

export function precioOpcional(precio: string): number | null {
  const texto = precio.trim();
  if (!texto) return null;
  return Number(texto);
}
