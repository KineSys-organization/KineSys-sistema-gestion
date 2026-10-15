// HU-33. Validación de un bloqueo de agenda (feriado, cierre o licencia).
// Los mismos mensajes que fn_crear_bloqueo. La base vuelve a validar al guardar.

export const LARGO_MAXIMO_MOTIVO_BLOQUEO = 100;
export const MAXIMO_DIAS_BLOQUEO = 90;

const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
const HORA_OK = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CamposBloqueo = {
  idProfesional: string; // vacío = todo el centro
  desde: string;
  hasta: string;
  horaDesde: string; // vacío = día completo
  horaHasta: string;
  motivo: string;
};

export type BloqueoVista = {
  id_bloqueo: string;
  alcance: "centro" | "profesional";
  fecha_desde: string;
  fecha_hasta: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  dia_completo: boolean;
  motivo: string;
};

export type TurnoAfectado = {
  id_turno: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  apellido_paciente: string;
  nombre_paciente: string;
  apellido_profesional: string;
  nombre_profesional: string;
};

function esFecha(valor: string): boolean {
  if (!FECHA_OK.test(valor)) return false;
  const dia = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === valor;
}

function diasInclusivos(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

export function validarBloqueo(campos: CamposBloqueo, hoy: string): string | null {
  const desde = campos.desde.trim();
  const hasta = campos.hasta.trim();
  if (!desde || !hasta) return "Indicá la fecha desde y la fecha hasta";
  if (!esFecha(desde) || !esFecha(hasta)) return "Indicá la fecha desde y la fecha hasta";
  if (hasta < desde) return "La fecha hasta no puede ser anterior a la fecha desde";
  if (desde < hoy) return "No se pueden bloquear fechas pasadas";
  if (diasInclusivos(desde, hasta) > MAXIMO_DIAS_BLOQUEO) {
    return "El bloqueo no puede superar los 90 días";
  }

  const horaDesde = campos.horaDesde.trim();
  const horaHasta = campos.horaHasta.trim();
  if ((horaDesde === "") !== (horaHasta === "")) {
    return "Completá la hora desde y la hora hasta, o dejá las dos vacías";
  }
  if (horaDesde) {
    if (!HORA_OK.test(horaDesde) || !HORA_OK.test(horaHasta)) {
      return "Las horas tienen que estar en formato HH:MM";
    }
    if (horaHasta <= horaDesde) return "La hora de fin debe ser posterior a la de inicio";
  }

  const motivo = campos.motivo.trim();
  if (!motivo) return "Indicá el motivo del bloqueo";
  if (motivo.length > LARGO_MAXIMO_MOTIVO_BLOQUEO) {
    return "El motivo no puede superar los 100 caracteres";
  }

  const profesional = campos.idProfesional.trim();
  if (profesional && !UUID_OK.test(profesional)) return "El profesional no existe o no está activo";
  return null;
}

// Lunes de la semana ISO de esa fecha.
export function lunesDe(fecha: string): string {
  const dia = new Date(`${fecha}T00:00:00Z`);
  const iso = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();
  dia.setUTCDate(dia.getUTCDate() - (iso - 1));
  return dia.toISOString().slice(0, 10);
}

// Domingo de la última semana, contando `semanas` semanas desde el lunes de `fecha`.
export function domingoDeSemanas(fecha: string, semanas: number): string {
  const lunes = new Date(`${lunesDe(fecha)}T00:00:00Z`);
  lunes.setUTCDate(lunes.getUTCDate() + semanas * 7 - 1);
  return lunes.toISOString().slice(0, 10);
}

// Primer y último día de "2026-10".
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [anio, numero] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimo).padStart(2, "0")}`,
  };
}

export function bloqueosEnFecha(fecha: string, bloqueos: BloqueoVista[]): BloqueoVista[] {
  const dia = fecha.slice(0, 10);
  return bloqueos.filter(
    (b) => dia >= b.fecha_desde.slice(0, 10) && dia <= b.fecha_hasta.slice(0, 10)
  );
}

export function textoBloqueo(bloqueo: BloqueoVista): string {
  const alcance = bloqueo.alcance === "centro" ? "Todo el centro" : "Licencia del profesional";
  const horario = bloqueo.dia_completo
    ? "Día completo"
    : `${bloqueo.hora_desde} a ${bloqueo.hora_hasta}`;
  return `${alcance} · ${horario} · ${bloqueo.motivo}`;
}
