import { ImprimirOrdenButton } from "@/components/atencion/ImprimirOrdenButton";
import { formatearMomento } from "@/lib/pagos/validar";
import { formatearFecha } from "@/lib/turnos/validar";
import {
  textoCobertura,
  textoSesiones,
  tituloOrden,
  type DatosOrden,
} from "@/lib/atencion/orden";

// HU-38. Datos automáticos de la orden (paciente, cobertura, profesional, servicio y fecha).
// Son de solo lectura: salen del turno en la base, el profesional no los escribe.
export function DatosAutomaticosOrden({ datos }: { datos: Omit<DatosOrden, "sesiones" | "detalle" | "registradoEn" | "editadoEn"> }) {
  return (
    <dl className="resumen-turno datos-orden">
      <dt>Paciente</dt>
      <dd>
        {datos.apellidoPaciente}, {datos.nombrePaciente} · DNI {datos.dniPaciente}
      </dd>
      <dt>Cobertura</dt>
      <dd>{textoCobertura(datos.cobertura, datos.numeroAfiliado)}</dd>
      <dt>Profesional</dt>
      <dd>
        {datos.apellidoProfesional}, {datos.nombreProfesional}
        {datos.matriculaProfesional && ` · Mat. ${datos.matriculaProfesional}`}
      </dd>
      <dt>Servicio</dt>
      <dd>{datos.servicio}</dd>
      <dt>Fecha del turno</dt>
      <dd>{formatearFecha(datos.fechaTurno)}</dd>
    </dl>
  );
}

// HU-38 / HU-24B. Una orden registrada: en pantalla + el bloque que se imprime.
// `conDatos` = false cuando la pantalla ya muestra paciente/profesional (p. ej. el historial).
export function OrdenMedica({ datos, conDatos = true }: { datos: DatosOrden; conDatos?: boolean }) {
  const idBloque = `orden-impresion-${datos.id}`;

  return (
    <div className="bloque-orden-medica">
      <h4>Orden médica</h4>
      {conDatos && <DatosAutomaticosOrden datos={datos} />}
      <dl className="resumen-turno">
        <dt>Sesiones</dt>
        <dd>{textoSesiones(datos.sesiones)}</dd>
        <dt>Detalle</dt>
        <dd className="texto-observaciones">{datos.detalle}</dd>
        <dt>Registrada</dt>
        <dd>{formatearMomento(datos.registradoEn)}</dd>
        {datos.editadoEn && (
          <>
            <dt>Editada</dt>
            <dd>{formatearMomento(datos.editadoEn)}</dd>
          </>
        )}
      </dl>
      <ImprimirOrdenButton idBloque={idBloque} titulo={tituloOrden(datos)} />

      {/* Lo que se imprime / guarda como PDF (mismo formato que HU-27). */}
      <section id={idBloque} className="solo-impresion bloque-impresion orden-impresion">
        <header className="encabezado-impresion">
          <div className="marca-impresion">
            <img src="/logo-kinesys.svg" alt="" />
            <span>KineSys</span>
          </div>
          <p>Consultorio de kinesiología</p>
        </header>

        <div className="titulo-horario-impresion">
          <p className="etiqueta-impresion">ORDEN MÉDICA</p>
          <h2 className="titulo-profesional">
            {datos.apellidoPaciente}, {datos.nombrePaciente}
          </h2>
          <p>DNI {datos.dniPaciente}</p>
        </div>

        <DatosAutomaticosOrden datos={datos} />

        <h4>Cantidad de sesiones</h4>
        <p>{textoSesiones(datos.sesiones)}</p>

        <h4>Detalle</h4>
        <p className="texto-observaciones">{datos.detalle}</p>

        <p className="texto-suave">
          Registrada el {formatearMomento(datos.registradoEn)}
          {datos.editadoEn && ` · Editada el ${formatearMomento(datos.editadoEn)}`}
        </p>

        <div className="firma-orden">
          <span>Firma y sello del profesional</span>
        </div>

        <footer className="pie-impresion">Orden médica · KineSys</footer>
      </section>
    </div>
  );
}
