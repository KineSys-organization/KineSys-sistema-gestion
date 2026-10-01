import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirGerente } from "@/lib/auth";
import { obtenerProfesional } from "@/lib/profesionales/actions";
import { consultarHorarios } from "@/lib/profesionales/horarios-actions";
import { esIdProfesional } from "@/lib/profesionales/horarios";
import { HorariosPanel } from "@/components/profesionales/HorariosPanel";
import { DescargarHorarioPdfButton } from "@/components/profesionales/DescargarHorarioPdfButton";

export default async function HorariosPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirGerente();
  const { id } = await params;
  if (!esIdProfesional(id)) notFound();
  const { data, error } = await consultarHorarios(id);
  const { data: detalleProfesional } = await obtenerProfesional(id);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Horarios de atención</h2>
          {data && <p>{data.apellido_usuario}, {data.nombre_usuario}</p>}
          <p className="texto-suave">Las franjas se repiten cada semana. Podés cargar mañana y tarde en un mismo día.</p>
        </div>
        <div className="fila-acciones">
          <Link className="boton-secundario boton-inline" href="/profesionales">Volver</Link>
          {data && detalleProfesional && (
            <DescargarHorarioPdfButton
              nombre={detalleProfesional.nombre_usuario}
              apellido={detalleProfesional.apellido_usuario}
              servicios={detalleProfesional.servicios ?? []}
              franjas={data.franjas}
            />
          )}
        </div>
      </div>
      {error && <p className="mensaje-error" role="alert">{error}</p>}
      {data && (
        <HorariosPanel
          id={id}
          tieneServicios={data.tiene_servicios}
          habilitadoTurnos={data.habilitado_turnos}
          franjas={data.franjas}
        />
      )}
    </section>
  );
}

