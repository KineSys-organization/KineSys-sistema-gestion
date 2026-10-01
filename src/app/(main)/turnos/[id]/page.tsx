import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { puedeHacer } from "@/lib/auth/permisos";
import { AusenciaTurnoForm } from "@/components/turnos/AusenciaTurnoForm";
import { CancelarTurnoForm } from "@/components/turnos/CancelarTurnoForm";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import { RepetirTurnoForm } from "@/components/turnos/RepetirTurnoForm";
import { obtenerTurno } from "@/lib/turnos/actions";
import { obtenerPagoTurno } from "@/lib/pagos/actions";
import { etiquetaMedio, formatearPesos } from "@/lib/pagos/validar";
import { urlPasoHorario, urlPasoPaciente } from "@/lib/turnos/flujo";
import { etiquetaMotivo, formatearFecha } from "@/lib/turnos/validar";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reprogramado?: string; nuevo?: string }>;
};

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
// HU-10B: marcar ausencia (ya terminó) o corregirla. HU-10C: reprogramar (no empezó).
// HU-25: repetir un turno confirmado las próximas semanas (también justo después de otorgarlo).
// Qué botón aparece lo decide la base (cancelable, marcable_ausente, ...), no el navegador.
export default async function TurnoPage({ params, searchParams }: Props) {
  const usuario = await exigirRecepcion();
  const { id } = await params;
  const { reprogramado, nuevo } = await searchParams;
  // HU-14: el pago va en su propia consulta (el turno no cambia por cobrarlo).
  const [{ data: turno, error }, { data: detallePago, error: errorPago }] = await Promise.all([
    obtenerTurno(id),
    obtenerPagoTurno(id),
  ]);

  if (error || !turno) {
    return (
      <section className="modulo">
        <h2>Turno</h2>
        <p className="mensaje-error" role="alert">
          {error ?? "El turno no existe"}
        </p>
        <Link href="/turnos">Volver al listado de turnos</Link>
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
        <EstadoTurnoBadge estado={turno.estado} />
      </div>

      {/* HU-10C: vuelve acá después de reprogramar. */}
      {reprogramado && turno.estado === "confirmado" && (
        <p className="mensaje-ok" role="status">
          Turno reprogramado. El horario anterior quedó libre.
        </p>
      )}

      {/* HU-25: recién otorgado (viene de otorgarTurno) → se ofrece repetirlo. */}
      {nuevo && turno.estado === "confirmado" && (
        <p className="mensaje-ok" role="status">
          Turno otorgado. Si el paciente viene todas las semanas, podés repetirlo abajo.
        </p>
      )}

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

      {/* HU-14: pago del turno. Cobrar es posterior a reservar; el pago se conserva
          aunque después se cancele, se marque ausente o se reprograme. */}
      <div className="tarjeta bloque-pago">
        <h3>Pago</h3>
        {errorPago ? (
          <p className="mensaje-error" role="alert">
            {errorPago}
          </p>
        ) : detallePago?.pago ? (
          <p>
            Cobrado <strong>{formatearPesos(detallePago.pago.importe_final)}</strong> ·{" "}
            {etiquetaMedio(detallePago.pago.medio_pago)} ·{" "}
            {formatearMomento(detallePago.pago.registrado_en)}{" "}
            <Link href={`/turnos/${turno.id_turno}/pago`}>Ver o corregir</Link>
          </p>
        ) : detallePago?.cobrable ? (
          <p>
            Sin pago registrado.{" "}
            <Link
              className="boton-principal boton-inline"
              href={`/turnos/${turno.id_turno}/pago`}
            >
              Registrar pago
            </Link>
          </p>
        ) : (
          <p className="texto-suave">Sin pago registrado.</p>
        )}
      </div>

      {/* Acciones: principal y secundarias a la izquierda, cancelar (riesgo) aparte a la
          derecha. Todas con el mismo alto; los formularios de confirmación se abren abajo. */}
      <div className="acciones-pie">
        {/* HU-28: seguir con el mismo paciente (pasos 2 y 3) o arrancar con otro (paso 1). */}
        <Link
          className="boton-principal boton-inline"
          href={urlPasoHorario({
            paciente: turno.id_paciente,
            profesional: turno.id_profesional,
            servicio: turno.id_servicio,
          })}
        >
          Otro turno para este paciente
        </Link>
        <Link className="boton-secundario boton-inline" href={urlPasoPaciente()}>
          Otorgar turno a otro paciente
        </Link>
        {turno.reprogramable && (
          <Link
            className="boton-secundario boton-inline"
            href={`/turnos/${turno.id_turno}/reprogramar`}
          >
            Reprogramar
          </Link>
        )}
        <Link
          className="boton-secundario boton-inline"
          href={`/agenda?profesional=${turno.id_profesional}&fecha=${turno.fecha}`}
        >
          Ver agenda del día
        </Link>
        {/* HU-25: solo desde un turno confirmado (la base lo vuelve a validar). */}
        {turno.estado === "confirmado" && puedeHacer(usuario.rol_usuario, "turnos.repetir") && (
          <RepetirTurnoForm idTurno={turno.id_turno} abiertoInicial={Boolean(nuevo)} />
        )}
        {turno.marcable_ausente && (
          <AusenciaTurnoForm idTurno={turno.id_turno} modo="marcar" />
        )}
        {turno.ausencia_corregible && (
          <AusenciaTurnoForm idTurno={turno.id_turno} modo="corregir" />
        )}
        {turno.cancelable && <CancelarTurnoForm idTurno={turno.id_turno} />}
      </div>
    </section>
  );
}
