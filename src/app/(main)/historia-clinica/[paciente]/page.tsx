import Link from "next/link";
import { exigirProfesional } from "@/lib/auth";
import { obtenerHistoriaClinica } from "@/lib/historia-clinica/actions";
import type { CamposFicha } from "@/lib/historia-clinica/tipos";
import {
  CAMPOS_FICHA,
  esIdValido,
  formatearMomento,
  urlHistoria,
} from "@/lib/historia-clinica/validar";
import { consultarHistorialPaciente } from "@/lib/historial/actions";
import { leerFiltrosHistorial } from "@/lib/historial/validar";
import { calcularEdad, hoyArgentina } from "@/lib/atencion/validar";
import { formatearFecha } from "@/lib/turnos/validar";
import { HistoriaClinicaForm } from "@/components/historia-clinica/HistoriaClinicaForm";
import { ImprimirHistoriaButton } from "@/components/historia-clinica/ImprimirHistoriaButton";
import { HistorialPaciente } from "@/components/historial/HistorialPaciente";

type Props = {
  params: Promise<{ paciente: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Los campos de la ficha como lista de definición; los vacíos se muestran con "—".
function DatosFicha({ ficha }: { ficha: CamposFicha }) {
  return (
    <dl className="resumen-turno ficha-clinica">
      {CAMPOS_FICHA.map((campo) => (
        <div key={campo.nombre} className="ficha-fila">
          <dt>{campo.etiqueta}</dt>
          <dd className="texto-observaciones">{ficha[campo.nombre] || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// HU-39 + HU-16. Historia clínica: arriba la ficha (se carga y edita) y abajo la evolución
// (historial completo del paciente: todos los turnos + atención en los atendidos).
// Solo Profesionales con un turno con el paciente. Se abre desde /mi-agenda/[id].
export default async function HistoriaClinicaPage({ params, searchParams }: Props) {
  const usuario = await exigirProfesional();
  const { paciente } = await params;
  const paramsUrl = await searchParams;
  const turno = typeof paramsUrl.turno === "string" ? paramsUrl.turno : "";
  const editar = typeof paramsUrl.editar === "string" ? paramsUrl.editar : "";
  const ok = typeof paramsUrl.ok === "string" ? paramsUrl.ok : "";
  const idTurno = esIdValido(turno) ? turno : null;
  const volver = idTurno ? `/mi-agenda/${idTurno}` : "/mi-agenda";
  const textoVolver = idTurno ? "← Volver al turno" : "← Volver a mi agenda";
  const filtrosHistorial = leerFiltrosHistorial(paramsUrl, false);

  const [{ data, error }, historial] = await Promise.all([
    obtenerHistoriaClinica(paciente),
    consultarHistorialPaciente(paciente, filtrosHistorial),
  ]);

  if (error || !data) {
    return (
      <section className="modulo modulo-angosto">
        <h2>Historia clínica</h2>
        <p className="mensaje-error" role="alert">
          {error ?? "No se pudo cargar la historia clínica"}
        </p>
        <Link href={volver}>{textoVolver}</Link>
      </section>
    );
  }

  const { ficha, versiones, evolucion } = data;
  const p = data.paciente;
  const edad = calcularEdad(p.fecha_nacimiento_paciente, hoyArgentina());
  const editando = editar === "1";
  const urlVer = urlHistoria(p.id_paciente, { turno: idTurno });

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera no-imprimir">
        <div>
          <h2>Historia clínica</h2>
          <p className="texto-suave">
            {p.apellido_paciente}, {p.nombre_paciente} · DNI {p.dni_paciente}
            {edad !== null && ` · ${edad} años`}
            {p.telefono_paciente && ` · Tel. ${p.telefono_paciente}`}
          </p>
        </div>
        {ficha && !editando && (
          <ImprimirHistoriaButton
            titulo={`Historia clínica - ${p.apellido_paciente}, ${p.nombre_paciente}`}
          />
        )}
      </div>

      {ok === "guardada" && (
        <p className="mensaje-ok" role="status">
          Historia clínica guardada.
        </p>
      )}

      {editando ? (
        <HistoriaClinicaForm
          idPaciente={p.id_paciente}
          idTurno={idTurno}
          ficha={ficha}
          urlCancelar={urlVer}
        />
      ) : (
        <div className="tarjeta bloque">
          <h3>Ficha clínica</h3>
          {ficha ? (
            <>
              <DatosFicha ficha={ficha} />
              <p className="texto-suave ultima-modificacion">
                Última modificación: {ficha.modificado_por}, {formatearMomento(ficha.modificado_en)}
              </p>
              <Link
                className="boton-principal boton-inline"
                href={urlHistoria(p.id_paciente, { turno: idTurno, editar: true })}
              >
                Editar historia clínica
              </Link>
            </>
          ) : (
            <>
              <p className="texto-suave">Todavía no se cargó la historia clínica.</p>
              <Link
                className="boton-principal boton-inline"
                href={urlHistoria(p.id_paciente, { turno: idTurno, editar: true })}
              >
                Completar historia clínica
              </Link>
            </>
          )}

          {versiones.length > 0 && (
            <details className="versiones-historia">
              <summary>
                Versiones anteriores ({versiones.length})
              </summary>
              {versiones.map((version) => (
                <div key={version.reemplazada_en + version.modificado_en} className="version-historia">
                  <p className="texto-suave">
                    Escrita por {version.modificado_por} el {formatearMomento(version.modificado_en)}
                    {" · "}reemplazada el {formatearMomento(version.reemplazada_en)}
                  </p>
                  <DatosFicha ficha={version} />
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {!editando && (
        <section className="tarjeta bloque">
          <HistorialPaciente
            base={urlHistoria(p.id_paciente, { turno: idTurno })}
            filtros={filtrosHistorial}
            historial={historial.data}
            error={historial.error}
            verCobro={false}
            verAtencion
            verOrdenes={false}
            idUsuarioActual={usuario.id_usuario}
            titulo="Evolución"
            ocultos={idTurno ? { turno: idTurno } : {}}
          />
        </section>
      )}

      <div className="acciones-pie no-imprimir">
        <Link className="boton-secundario boton-inline" href={volver}>
          {textoVolver}
        </Link>
      </div>

      {/* Lo que se imprime / guarda como PDF (HU-27): logo, paciente, ficha y evolución. */}
      {ficha && (
        <section className="solo-impresion bloque-impresion historia-impresion">
          <header className="encabezado-impresion">
            <div className="marca-impresion">
              <img src="/logo-kinesys.svg" alt="" />
              <span>KineSys</span>
            </div>
            <p>Consultorio de kinesiología</p>
          </header>

          <div className="titulo-horario-impresion">
            <p className="etiqueta-impresion">HISTORIA CLÍNICA</p>
            <h2 className="titulo-profesional">
              {p.apellido_paciente}, {p.nombre_paciente}
            </h2>
            <p>
              DNI {p.dni_paciente}
              {edad !== null && ` · ${edad} años`}
            </p>
          </div>

          <h4>Ficha clínica</h4>
          <DatosFicha ficha={ficha} />
          <p className="texto-suave">
            Última modificación: {ficha.modificado_por}, {formatearMomento(ficha.modificado_en)}
          </p>

          <h4>Evolución</h4>
          {evolucion.length === 0 ? (
            <p>Sin atenciones registradas.</p>
          ) : (
            evolucion.map((a) => (
              <div key={a.id_turno} className="item-evolucion">
                <p>
                  <strong>
                    {formatearFecha(String(a.fecha_atencion).slice(0, 10))} · {a.hora_inicio}
                  </strong>{" "}
                  · {a.profesional} · {a.nombre_servicio}
                </p>
                <p>Motivo: {a.motivo_consulta ?? "—"}</p>
                <p className="texto-observaciones">{a.observaciones}</p>
                {a.orden_medica && (
                  <p className="texto-observaciones">Orden médica: {a.orden_medica}</p>
                )}
              </div>
            ))
          )}

          <footer className="pie-impresion">
            Historia clínica · KineSys · Documento confidencial
          </footer>
        </section>
      )}
    </section>
  );
}
