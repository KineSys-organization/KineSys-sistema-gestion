import Link from "next/link";
import { exigirProfesional } from "@/lib/auth";
import { AtencionForm } from "@/components/atencion/AtencionForm";
import { consultarMiAgenda, obtenerMiTurno } from "@/lib/atencion/actions";
import { calcularEdad, hoyArgentina } from "@/lib/atencion/validar";
import { etiquetaMotivo, formatearFecha } from "@/lib/turnos/validar";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
};

const ETIQUETA_ESTADO = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  ausente: "Ausente",
  atendido: "Atendido",
} as const;

const CLASE_ESTADO = {
  confirmado: "badge-activo",
  cancelado: "badge-cancelado",
  ausente: "badge-inactivo",
  atendido: "badge-atendido",
} as const;

const MENSAJES_OK: Record<string, string> = {
  registrada: "Atención registrada. El turno quedó como Atendido.",
  editada: "Cambios guardados en la atención.",
};

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

// HU-12: el profesional abre un turno de su agenda y ve al paciente.
// HU-13: si es un turno confirmado del día, registra la atención; si ya está
// atendido, la ve y puede editarla solo con el botón "Editar atención".
// Un turno de otro profesional lo rechaza fn_obtener_turno (no alcanza con cambiar el id).
export default async function MiTurnoPage({ params, searchParams }: Props) {
  await exigirProfesional();
  const { id } = await params;
  const { ok } = await searchParams;
  const { data: turno, error } = await obtenerMiTurno(id);

  if (error || !turno) {
    return (
      <section className="modulo modulo-angosto">
        <h2>Turno</h2>
        <p className="mensaje-error" role="alert">
          {error ?? "El turno no existe"}
        </p>
        <Link href="/mi-agenda">Volver a mi agenda</Link>
      </section>
    );
  }

  const hoy = hoyArgentina();
  const edad = calcularEdad(turno.fecha_nacimiento_paciente, hoy);
  const mensajeOk = ok ? MENSAJES_OK[ok] : undefined;

  // Ya atendido (o cancelado): el próximo turno del día que falta atender.
  const siguiente =
    turno.atendible || turno.fecha !== hoy
      ? null
      : ((await consultarMiAgenda(turno.fecha)).data?.turnos ?? []).find(
          (t) => t.atendible && t.id_turno !== turno.id_turno
        ) ?? null;

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera">
        <div>
          <h2>
            {turno.apellido_paciente}, {turno.nombre_paciente}
          </h2>
          <p className="texto-suave">
            {formatearFecha(turno.fecha)} · {turno.hora_inicio} a {turno.hora_fin}
          </p>
        </div>
        <span className={CLASE_ESTADO[turno.estado] ?? "badge-inactivo"}>
          {ETIQUETA_ESTADO[turno.estado] ?? turno.estado}
        </span>
      </div>

      {mensajeOk && (
        <p className="mensaje-ok" role="status">
          {mensajeOk}
        </p>
      )}

      <div className="tarjeta bloque">
        <h3>Paciente</h3>
        <dl className="resumen-turno">
          <dt>Nombre</dt>
          <dd>
            {turno.apellido_paciente}, {turno.nombre_paciente}
          </dd>
          <dt>DNI</dt>
          <dd>{turno.dni_paciente}</dd>
          {edad !== null && (
            <>
              <dt>Edad</dt>
              <dd>{edad} años</dd>
            </>
          )}
          {turno.telefono_paciente && (
            <>
              <dt>Teléfono</dt>
              <dd>{turno.telefono_paciente}</dd>
            </>
          )}
          <dt>Cobertura</dt>
          <dd>
            {turno.cobertura}
            {turno.numero_afiliado && ` · nº ${turno.numero_afiliado}`}
          </dd>
          <dt>Servicio</dt>
          <dd>{turno.nombre_servicio}</dd>
          {turno.estado === "cancelado" && (
            <>
              <dt>Motivo de cancelación</dt>
              <dd>{etiquetaMotivo(turno.motivo_cancelacion)}</dd>
            </>
          )}
        </dl>
      </div>

      {turno.estado === "atendido" && turno.atencion && (
        <div className="tarjeta bloque">
          <h3>Atención registrada</h3>
          <dl className="resumen-turno">
            <dt>Fecha de atención</dt>
            <dd>{formatearFecha(String(turno.atencion.fecha_atencion).slice(0, 10))}</dd>
            <dt>Profesional</dt>
            <dd>
              {turno.apellido_profesional}, {turno.nombre_profesional}
            </dd>
            <dt>Motivo de consulta</dt>
            <dd>{turno.atencion.motivo_consulta ?? "—"}</dd>
            <dt>Observaciones</dt>
            <dd className="texto-observaciones">{turno.atencion.observaciones}</dd>
            <dt>Registrada</dt>
            <dd>{formatearMomento(turno.atencion.registrado_en)}</dd>
            {turno.atencion.editado_en && (
              <>
                <dt>Última edición</dt>
                <dd>{formatearMomento(turno.atencion.editado_en)}</dd>
              </>
            )}
          </dl>
          <AtencionForm
            // key: si cambia la atención guardada, el formulario arranca con los datos nuevos.
            key={turno.atencion.editado_en ?? turno.atencion.registrado_en}
            idTurno={turno.id_turno}
            modo="editar"
            observaciones={turno.atencion.observaciones}
            motivo={turno.atencion.motivo_consulta}
          />
        </div>
      )}

      {turno.atendible && <AtencionForm idTurno={turno.id_turno} modo="registrar" />}

      {turno.estado === "confirmado" && !turno.atendible && (
        <p className="texto-suave aviso-atencion">
          {turno.fecha > hoy
            ? "Vas a poder registrar la atención el día del turno."
            : "Este turno es de un día anterior; la atención se registra el mismo día del turno."}
        </p>
      )}

      {turno.estado === "cancelado" && (
        <p className="texto-suave aviso-atencion">
          El turno fue cancelado: no se registra atención.
        </p>
      )}

      <div className="acciones-pie">
        <Link
          className="boton-secundario boton-inline"
          href={`/mi-agenda?fecha=${turno.fecha}`}
        >
          ← Volver a mi agenda
        </Link>
        {/* Después de atender, seguir con el próximo paciente del día sin volver a la lista. */}
        {siguiente && (
          <Link className="boton-principal boton-inline" href={`/mi-agenda/${siguiente.id_turno}`}>
            Siguiente paciente: {siguiente.hora_inicio} · {siguiente.apellido_paciente} →
          </Link>
        )}
      </div>
    </section>
  );
}
