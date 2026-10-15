import Link from "next/link";
import { exigirProfesional } from "@/lib/auth";
import { obtenerMiTurno } from "@/lib/atencion/actions";
import { listarOrdenesPaciente } from "@/lib/ordenes/actions";
import { leerFiltrosOrdenes } from "@/lib/ordenes/validar";
import { HistorialOrdenes } from "@/components/ordenes/HistorialOrdenes";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// HU-24B. El Profesional abre el historial de órdenes del paciente desde un turno propio.
// El paciente sale del turno (fn_obtener_turno ya exige que sea suyo) y la base vuelve
// a exigir que tenga o haya tenido un turno con ese paciente.
export default async function OrdenesPacientePage({ params, searchParams }: Props) {
  await exigirProfesional();
  const { id } = await params;
  const filtros = leerFiltrosOrdenes(await searchParams);
  const volver = `/mi-agenda/${id}`;

  const { data: turno, error } = await obtenerMiTurno(id);

  if (error || !turno) {
    return (
      <section className="modulo modulo-angosto">
        <h2>Historial de órdenes</h2>
        <p className="mensaje-error" role="alert">
          {error ?? "El turno no existe"}
        </p>
        <Link href="/mi-agenda">Volver a mi agenda</Link>
      </section>
    );
  }

  const { data: historial, error: errorOrdenes } = await listarOrdenesPaciente(
    turno.id_paciente,
    filtros
  );

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera">
        <div>
          <h2>Historial de órdenes</h2>
          <p className="texto-suave">
            {turno.apellido_paciente}, {turno.nombre_paciente} · DNI {turno.dni_paciente}
          </p>
        </div>
      </div>

      <div className="tarjeta bloque">
        <p className="texto-suave">
          Órdenes de todos los profesionales, de la más reciente a la más antigua. Solo lectura:
          cada orden la corrige el profesional que la registró, desde su atención.
        </p>
        <HistorialOrdenes
          base={`/mi-agenda/${id}/ordenes`}
          filtros={filtros}
          historial={historial}
          error={errorOrdenes}
        />
      </div>

      <div className="acciones-pie no-imprimir">
        <Link className="boton-secundario boton-inline" href={volver}>
          ← Volver al turno
        </Link>
      </div>
    </section>
  );
}
