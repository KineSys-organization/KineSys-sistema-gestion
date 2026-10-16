import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRecepcion } from "@/lib/auth";
import { puedeHacer } from "@/lib/auth/permisos";
import { listarObrasSociales, obtenerPaciente } from "@/lib/pacientes/actions";
import { listarOrdenesPaciente } from "@/lib/ordenes/actions";
import { leerFiltrosOrdenes } from "@/lib/ordenes/validar";
import { consultarHistorialPaciente } from "@/lib/historial/actions";
import { leerFiltrosHistorial } from "@/lib/historial/validar";
import { EditarPacienteForm } from "@/components/pacientes/EditarPacienteForm";
import { HistorialOrdenes } from "@/components/ordenes/HistorialOrdenes";
import { HistorialPaciente } from "@/components/historial/HistorialPaciente";
import { EstadoPacienteForm } from "@/components/pacientes/EstadoPacienteForm";
import { esIdPaciente } from "@/lib/pacientes/validar";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditarPacientePage({ params, searchParams }: Props) {
  const usuario = await exigirRecepcion();
  const { id } = await params;

  if (!esIdPaciente(id)) notFound();

  const paramsUrl = await searchParams;
  // HU-24B: el historial de órdenes médicas solo lo ve el Gerente (Mesa de Entradas no).
  const verOrdenes = puedeHacer(usuario.rol_usuario, "ordenes.consultar");
  const filtrosOrdenes = leerFiltrosOrdenes(paramsUrl);
  // HU-16: historial administrativo (prefijo h_ para no chocar con los filtros de órdenes).
  const filtrosHistorial = leerFiltrosHistorial(paramsUrl, true);

  const [{ data: paciente, error }, { data: obras, error: errorObras }, ordenes, historial] =
    await Promise.all([
      obtenerPaciente(id),
      listarObrasSociales(),
      verOrdenes ? listarOrdenesPaciente(id, filtrosOrdenes) : null,
      consultarHistorialPaciente(id, filtrosHistorial),
    ]);

  if (error || !paciente) notFound();

  return (
    <section className="modulo modulo-paciente-ficha">
      <div className="modulo-cabecera">
        <div>
          <h2>Ficha del paciente</h2>
          <p className="texto-suave">
            {paciente.apellido_paciente}, {paciente.nombre_paciente} · DNI {paciente.dni_paciente}
          </p>
        </div>
        <Link className="boton-pill" href="/pacientes">
          Volver
        </Link>
      </div>

      {errorObras && <p className="mensaje-error" role="alert">{errorObras}</p>}
      <div className="paciente-ficha-grid">
        <div className="tarjeta">
          <h3>Datos del paciente</h3>
          <p className="texto-suave">
            Podés corregir contacto y obras sociales. DNI y fecha de nacimiento no cambian.
          </p>
          <EditarPacienteForm paciente={paciente} obras={obras} />
        </div>
        <div className="tarjeta">
          <EstadoPacienteForm paciente={paciente} />
        </div>
      </div>

      <div className="tarjeta bloque">
        <HistorialPaciente
          base={`/pacientes/${id}`}
          filtros={filtrosHistorial}
          historial={historial.data}
          error={historial.error}
          verCobro
          verAtencion={false}
          verOrdenes={verOrdenes}
          prefijados
        />
      </div>

      {ordenes && (
        <div className="tarjeta bloque" id="ordenes">
          <h3>Órdenes médicas</h3>
          <p className="texto-suave">
            Órdenes de todas las atenciones del paciente, de la más reciente a la más antigua.
            Solo lectura: las corrige el profesional que las registró.
          </p>
          <HistorialOrdenes
            base={`/pacientes/${id}`}
            filtros={filtrosOrdenes}
            historial={ordenes.data}
            error={ordenes.error}
          />
        </div>
      )}
    </section>
  );
}
