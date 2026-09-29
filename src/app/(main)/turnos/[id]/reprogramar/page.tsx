import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { CalendarioDias } from "@/components/disponibilidad/CalendarioDias";
import { ConfirmarReprogramacionForm } from "@/components/turnos/ConfirmarReprogramacionForm";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import { obtenerCalendario, obtenerDisponibilidad } from "@/lib/disponibilidad/actions";
import { diaSeleccionado } from "@/lib/disponibilidad/calendario";
import { obtenerTurno } from "@/lib/turnos/actions";
import type { Turno } from "@/lib/turnos/tipos";
import { formatearFecha, urlReprogramar } from "@/lib/turnos/validar";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string; hora?: string }>;
};

// HU-10C. Reprogramar un turno: parte del turno ya otorgado (paciente, profesional y
// servicio no cambian) → día en el calendario → horario → resumen → confirmar.
// Día y horario elegidos van en la URL, así "Elegir otro horario" no pierde nada.
// La disponibilidad no cuenta al propio turno: se puede correr aunque el horario
// nuevo se superponga con el actual.
export default async function ReprogramarTurnoPage({ params, searchParams }: Props) {
  await exigirRecepcion();
  const { id } = await params;
  const elegido = await searchParams;
  const { data: turno, error } = await obtenerTurno(id);

  if (error || !turno) {
    return (
      <section className="modulo">
        <h2>Reprogramar turno</h2>
        <p className="mensaje-error" role="alert">
          {error ?? "El turno no existe"}
        </p>
        <Link href="/turnos">Volver al listado de turnos</Link>
      </section>
    );
  }

  // La base decide si se puede (confirmado y no empezó). Igual lo vuelve a validar al confirmar.
  if (!turno.reprogramable) {
    return (
      <section className="modulo">
        <div className="modulo-cabecera">
          <h2>Reprogramar turno</h2>
          <EstadoTurnoBadge estado={turno.estado} />
        </div>
        <p className="mensaje-error" role="alert">
          Este turno no se puede reprogramar: solo se reprograman turnos confirmados que
          todavía no empezaron.
        </p>
        <Link className="boton-secundario boton-inline" href={`/turnos/${turno.id_turno}`}>
          Volver al turno
        </Link>
      </section>
    );
  }

  return (
    <section className="modulo modulo-turno">
      <div className="modulo-cabecera">
        <div>
          <h2>Reprogramar turno</h2>
          <p className="texto-suave">
            Elegí el nuevo día y horario. Se mantiene el mismo turno: paciente, profesional,
            servicio y cobertura no cambian.
          </p>
        </div>
      </div>

      <div className="tarjeta bloque">
        <dl className="resumen-turno">
          <dt>Paciente</dt>
          <dd>
            {turno.apellido_paciente}, {turno.nombre_paciente} · DNI {turno.dni_paciente}
          </dd>
          <dt>Profesional</dt>
          <dd>
            {turno.apellido_profesional}, {turno.nombre_profesional}
          </dd>
          <dt>Servicio</dt>
          <dd>{turno.nombre_servicio}</dd>
          <dt>Horario actual</dt>
          <dd>
            {formatearFecha(turno.fecha)} · {turno.hora_inicio} a {turno.hora_fin}
          </dd>
        </dl>
      </div>

      {elegido.fecha && elegido.hora ? (
        <Resumen turno={turno} fecha={elegido.fecha} hora={elegido.hora} />
      ) : (
        <ElegirHorario turno={turno} fechaPedida={elegido.fecha ?? turno.fecha} />
      )}
    </section>
  );
}

// Paso 1: calendario de 30 días + horarios libres del día elegido.
async function ElegirHorario({ turno, fechaPedida }: { turno: Turno; fechaPedida: string }) {
  const { data: calendario, error } = await obtenerCalendario({
    id_profesional: turno.id_profesional,
    id_servicio: turno.id_servicio,
    excluir_turno: turno.id_turno,
  });

  if (error || !calendario) {
    return (
      <p className="mensaje-error" role="alert">
        {error ?? "No se pudo armar el calendario"}
      </p>
    );
  }

  const fecha = diaSeleccionado(calendario.dias, fechaPedida);
  const totalLibres = calendario.dias.reduce((suma, d) => suma + d.libres, 0);

  return (
    <div className="grid-turno">
      <section className="tarjeta">
        <div className="modulo-cabecera">
          <h3>Próximos 30 días</h3>
          <p className="texto-suave">
            {calendario.nombre_servicio} · {calendario.duracion_minutos} min
          </p>
        </div>
        {totalLibres === 0 && (
          <p className="aviso-accion">
            No hay horarios libres en los próximos 30 días para este profesional y servicio.
          </p>
        )}
        <CalendarioDias
          dias={calendario.dias}
          fechaElegida={fecha}
          hrefDia={(dia) => urlReprogramar(turno.id_turno, { fecha: dia })}
        />
      </section>

      <section className="tarjeta" aria-live="polite">
        {fecha ? (
          <HorariosDelDia turno={turno} fecha={fecha} />
        ) : (
          <>
            <h3>Horarios</h3>
            <p className="texto-suave">Elegí un día con horarios libres.</p>
          </>
        )}
      </section>
    </div>
  );
}

async function HorariosDelDia({ turno, fecha }: { turno: Turno; fecha: string }) {
  const { data, error } = await obtenerDisponibilidad({
    id_profesional: turno.id_profesional,
    id_servicio: turno.id_servicio,
    fecha,
    excluir_turno: turno.id_turno,
  });

  return (
    <>
      <h3>{formatearFecha(fecha)}</h3>
      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
      {data && data.horarios.length === 0 && (
        <p className="texto-suave">{data.mensaje ?? "No hay horarios libres para ese día."}</p>
      )}
      {data && data.horarios.length > 0 && (
        <>
          <p className="texto-suave">Tocá el nuevo horario.</p>
          <ul className="horarios-botones">
            {data.horarios.map((hora) =>
              // El horario actual no se ofrece: reprogramar al mismo lugar no cambia nada.
              fecha === turno.fecha && hora === turno.hora_inicio ? (
                <li key={hora}>
                  <span className="horario-boton horario-actual" title="Horario actual del turno">
                    {hora} · actual
                  </span>
                </li>
              ) : (
                <li key={hora}>
                  <Link
                    className="horario-boton"
                    href={urlReprogramar(turno.id_turno, { fecha, hora })}
                  >
                    {hora}
                  </Link>
                </li>
              )
            )}
          </ul>
        </>
      )}
    </>
  );
}

// Paso 2: resumen (horario anterior y nuevo) antes de confirmar.
async function Resumen({ turno, fecha, hora }: { turno: Turno; fecha: string; hora: string }) {
  // Se revisa que el horario siga libre para avisar antes; la base lo revalida al confirmar.
  const { data, error } = await obtenerDisponibilidad({
    id_profesional: turno.id_profesional,
    id_servicio: turno.id_servicio,
    fecha,
    excluir_turno: turno.id_turno,
  });
  const libre = !!data?.horarios.includes(hora);
  const mismo = fecha === turno.fecha && hora === turno.hora_inicio;
  const volver = urlReprogramar(turno.id_turno, { fecha });

  if (error || !libre || mismo) {
    return (
      <div className="tarjeta">
        <p className="mensaje-error" role="alert">
          {error ??
            (mismo
              ? "Elegí un horario distinto al actual"
              : "El horario seleccionado ya no está disponible")}
        </p>
        <Link className="boton-secundario boton-inline" href={volver}>
          Elegir otro horario
        </Link>
      </div>
    );
  }

  return (
    <div className="tarjeta">
      <h3>Confirmá el cambio</h3>
      <dl className="resumen-turno">
        <dt>Paciente</dt>
        <dd>
          {turno.apellido_paciente}, {turno.nombre_paciente}
        </dd>
        <dt>Profesional</dt>
        <dd>
          {turno.apellido_profesional}, {turno.nombre_profesional}
        </dd>
        <dt>Servicio</dt>
        <dd>{turno.nombre_servicio}</dd>
        <dt>Horario anterior</dt>
        <dd className="horario-anterior">
          {formatearFecha(turno.fecha)} · {turno.hora_inicio}
        </dd>
        <dt>Nuevo horario</dt>
        <dd>
          <strong>
            {formatearFecha(fecha)} · {hora}
          </strong>
        </dd>
      </dl>
      <ConfirmarReprogramacionForm
        idTurno={turno.id_turno}
        fecha={fecha}
        hora={hora}
        urlOtroHorario={volver}
      />
    </div>
  );
}
