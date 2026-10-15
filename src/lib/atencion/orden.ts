// HU-38 / HU-24B. Textos de la orden médica (lógica pura, sin Supabase ni Next, para `npm test`).

// 10 -> "10 sesiones", 1 -> "1 sesión", null -> "No informadas" (órdenes de HU-24A).
export function textoSesiones(sesiones: number | null | undefined): string {
  if (sesiones == null) return "No informadas";
  return sesiones === 1 ? "1 sesión" : `${sesiones} sesiones`;
}

// "OSDE" + "123" -> "OSDE · nº 123". Sin obra social -> "Particular".
export function textoCobertura(cobertura: string | null | undefined, afiliado?: string | null) {
  const nombre = cobertura?.trim() || "Particular";
  return afiliado && nombre !== "Particular" ? `${nombre} · nº ${afiliado}` : nombre;
}

// Lo que necesita la orden (en pantalla y en el PDF). Todo sale de la base.
export type DatosOrden = {
  id: string; // id del turno (una orden por atención, una atención por turno)
  nombrePaciente: string;
  apellidoPaciente: string;
  dniPaciente: number | string;
  cobertura: string;
  numeroAfiliado: string | null;
  nombreProfesional: string;
  apellidoProfesional: string;
  matriculaProfesional: string | null;
  servicio: string;
  fechaTurno: string; // YYYY-MM-DD
  sesiones: number | null;
  detalle: string;
  registradoEn: string;
  editadoEn: string | null;
};

// Título del PDF: "Orden médica - Pérez, Ana - 2026-10-15".
export function tituloOrden(datos: Pick<DatosOrden, "apellidoPaciente" | "nombrePaciente" | "fechaTurno">) {
  return `Orden médica - ${datos.apellidoPaciente}, ${datos.nombrePaciente} - ${datos.fechaTurno}`;
}
