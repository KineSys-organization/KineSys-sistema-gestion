import Link from "next/link";
import { OrdenMedica } from "@/components/atencion/OrdenMedica";
import { RangoFechas } from "@/components/turnos/RangoFechas";
import type { HistorialOrdenes as Historial } from "@/lib/ordenes/tipos";
import {
  hayFiltrosOrdenes,
  mensajeSinOrdenes,
  urlOrdenes,
  type FiltrosOrdenes,
} from "@/lib/ordenes/validar";
import { formatearFecha } from "@/lib/turnos/validar";

type Props = {
  // Ruta de la pantalla donde está el historial (los filtros van por GET a la misma URL).
  base: string;
  filtros: FiltrosOrdenes;
  historial: Historial | null;
  error: string | null;
};

// HU-24B. Historial de órdenes médicas del paciente: filtros + lista (solo lectura).
// Se usa en la ficha del paciente (Gerente) y desde un turno propio (Profesional).
export function HistorialOrdenes({ base, filtros, historial, error }: Props) {
  const ordenes = historial?.ordenes ?? [];

  return (
    <div className="historial-ordenes">
      <form className="filtros-ordenes no-imprimir" action={base} method="get">
        <RangoFechas desde={filtros.desde} hasta={filtros.hasta} />
        <div className="campo">
          <label htmlFor="profesional">Profesional</label>
          <select id="profesional" name="profesional" defaultValue={filtros.profesional}>
            <option value="">Todos</option>
            {(historial?.profesionales ?? []).map((p) => (
              <option key={p.id_profesional} value={p.id_profesional}>
                {p.apellido_profesional}, {p.nombre_profesional}
              </option>
            ))}
          </select>
        </div>
        <div className="fila-acciones">
          <button className="boton-principal boton-inline" type="submit">
            Filtrar
          </button>
          {hayFiltrosOrdenes(filtros) && (
            <Link className="boton-secundario boton-inline" href={urlOrdenes(base, { desde: "", hasta: "", profesional: "" })}>
              Limpiar filtros
            </Link>
          )}
        </div>
      </form>

      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}

      {!error && historial && ordenes.length === 0 && (
        <p className="texto-suave">{mensajeSinOrdenes(historial.total_sin_filtros)}</p>
      )}

      {historial && ordenes.length > 0 && (
        <ol className="lista-ordenes">
          {ordenes.map((o) => (
            <li key={o.id_atencion} className="item-orden">
              <p className="titulo-orden">
                <strong>
                  {formatearFecha(o.fecha)} · {o.hora_inicio}
                </strong>{" "}
                · {o.apellido_profesional}, {o.nombre_profesional} · {o.nombre_servicio}
              </p>
              <OrdenMedica
                datos={{
                  id: o.id_turno,
                  nombrePaciente: historial.paciente.nombre_paciente,
                  apellidoPaciente: historial.paciente.apellido_paciente,
                  dniPaciente: historial.paciente.dni_paciente,
                  cobertura: o.cobertura,
                  numeroAfiliado: o.numero_afiliado,
                  nombreProfesional: o.nombre_profesional,
                  apellidoProfesional: o.apellido_profesional,
                  matriculaProfesional: o.matricula_profesional,
                  servicio: o.nombre_servicio,
                  fechaTurno: o.fecha,
                  sesiones: o.orden_sesiones,
                  detalle: o.orden_medica,
                  registradoEn: o.registrado_en,
                  editadoEn: o.editado_en,
                }}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
