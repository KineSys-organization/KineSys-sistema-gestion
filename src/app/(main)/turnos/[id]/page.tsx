import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { CancelarTurnoForm } from "@/components/turnos/CancelarTurnoForm";
import { obtenerTurno } from "@/lib/turnos/actions";
import { etiquetaMotivo, formatearFecha } from "@/lib/turnos/validar";

type Props = {
  params: Promise<{ id: string }>;
};

const ETIQUETA_ESTADO = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  ausente: "Ausente",
  atendido: "Atendido", // HU-13
} as const;

const CLASE_ESTADO = {
  confirmado: "badge-activo",
  cancelado: "badge-cancelado",
  ausente: "badge-inactivo",
  atendido: "badge-atendido",
} as const;

const TITULO_ESTADO = {
  confirmado: "Turno otorgado",
  cancelado: "Turno cancelado",
  ausente: "Turno ausente",
  atendido: "Turno atendido",
} as const;

// "2026-09-24T18:05:00+00:00" -> "24/09/2026 15:05" (hora de Argentina).
function formatearMomento(valor: string): string {
  const momento = new Date(valor);
  if (Number.isNaN(momento.getTime())) return valor;
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(momento);
}

// Resumen del turno otorgado (HU-06). Es una página propia:
// recargarla no vuelve a confirmar el turno.
// HU-10A: desde acá se cancela, y si está cancelado se muestra el motivo.
export default async function TurnoPage({ params }: Props) {
  await exigirRecepcion();
  const { id } = await params;
  const { data: turno, error } = await obtenerTurno(id);

  if (error || !turno) {
    return (
      <section className="modulo">
        <h2>Turno</h2>
        <p className="mensaje-error" role="alert">
          {error ?? "El turno no existe"}
        </p>
        <Link href="/disponibilidad">Volver a otorgar turno</Link>
      </section>
    );
  }

  return (
    <section className="modulo modulo-turno">
      <div className="modulo-cabecera">
        <div>
          <h2>{TITULO_ESTADO[turno.estado] ?? "Turno"}</h2>
          <p className="texto-suave">Resumen para informarle al paciente.</p>
        </div>
        <span className={CLASE_ESTADO[turno.estado] ?? "badge-inactivo"}>
          {ETIQUETA_ESTADO[turno.estado] ?? turno.estado}
        </span>
      </div>

      <div className="tarjeta">
        <dl className="resumen-turno">
          <dt>Paciente</dt>
          <dd>
            {turno.apellido_paciente}, {turno.nombre_paciente} · DNI{" "}
            {turno.dni_paciente}
          </dd>
          <dt>Profesional</dt>
          <dd>
            {turno.apellido_profesional}, {turno.nombre_profesional}
          </dd>
          <dt>Servicio</dt>
          <dd>{turno.nombre_servicio}</dd>
          <dt>Día</dt>
          <dd>{formatearFecha(turno.fecha)}</dd>
          <dt>Hora</dt>
          <dd>
            {turno.hora_inicio} a {turno.hora_fin}
          </dd>
          <dt>Cobertura</dt>
          <dd>
            {turno.cobertura}
            {turno.numero_afiliado && ` · nº ${turno.numero_afiliado}`}
          </dd>
          {turno.estado === "cancelado" && (
            <>
              <dt>Motivo de cancelación</dt>
              <dd>{etiquetaMotivo(turno.motivo_cancelacion)}</dd>
              {turno.detalle_cancelacion && (
                <>
                  <dt>Detalle</dt>
                  <dd>{turno.detalle_cancelacion}</dd>
                </>
              )}
              {turno.cancelado_en && (
                <>
                  <dt>Cancelado el</dt>
                  <dd>{formatearMomento(turno.cancelado_en)}</dd>
                </>
              )}
            </>
          )}
        </dl>
      </div>

      {/* Acciones: principal y secundaria a la izquierda, cancelar (riesgo) aparte a la
          derecha. Todas con el mismo alto; el formulario de cancelación se abre abajo. */}
      <div className="acciones-pie">
        <Link className="boton-principal boton-inline" href="/disponibilidad">
          Otorgar otro turno
        </Link>
        <Link
          className="boton-secundario boton-inline"
          href={`/agenda?profesional=${turno.id_profesional}&fecha=${turno.fecha}`}
        >
          Ver agenda del día
        </Link>
        {turno.cancelable && <CancelarTurnoForm idTurno={turno.id_turno} />}
      </div>
    </section>
  );
}
