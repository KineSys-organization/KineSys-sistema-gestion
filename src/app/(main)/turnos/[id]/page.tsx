import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { obtenerTurno } from "@/lib/turnos/actions";
import { formatearFecha } from "@/lib/turnos/validar";

type Props = {
  params: Promise<{ id: string }>;
};

const ETIQUETA_ESTADO = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  ausente: "Ausente",
} as const;

// Resumen del turno otorgado (HU-06). Es una página propia:
// recargarla no vuelve a confirmar el turno.
export default async function TurnoPage({ params }: Props) {
  await exigirRecepcion();
  const { id } = await params;
  const { data: turno, error } = await obtenerTurno(id);

  if (error || !turno) {
    return (
      <section className="modulo">
        <h2>Turno</h2>
        <p className="mensaje-error">{error ?? "El turno no existe"}</p>
        <Link href="/disponibilidad">Volver a disponibilidad</Link>
      </section>
    );
  }

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera">
        <div>
          <h2>Turno otorgado</h2>
          <p className="texto-suave">Resumen para informarle al paciente.</p>
        </div>
        <span
          className={turno.estado === "confirmado" ? "badge-activo" : "badge-inactivo"}
        >
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
        </dl>
      </div>

      <div className="fila-acciones">
        <Link className="boton-principal boton-inline" href="/disponibilidad">
          Otorgar otro turno
        </Link>
      </div>
    </section>
  );
}
