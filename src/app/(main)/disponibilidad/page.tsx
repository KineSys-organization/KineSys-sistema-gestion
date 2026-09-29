import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirRecepcion } from "@/lib/auth";
import {
  listarProfesionalesParaDisponibilidad,
  obtenerCalendario,
  obtenerDisponibilidad,
} from "@/lib/disponibilidad/actions";
import { armarSemanas, DIAS_SEMANA, diaSeleccionado } from "@/lib/disponibilidad/calendario";
import { obtenerPaciente } from "@/lib/pacientes/actions";
import {
  urlPasoConfirmar,
  urlPasoHorario,
  urlPasoPaciente,
  type DatosFlujo,
} from "@/lib/turnos/flujo";
import { formatearFecha } from "@/lib/turnos/validar";
import type { Profesional } from "@/lib/profesionales/tipos";
import { PasosTurno } from "@/components/turnos/PasosTurno";
import { SelectorProfesionalServicio } from "@/components/disponibilidad/SelectorProfesionalServicio";

type Props = {
  searchParams: Promise<DatosFlujo>;
};

// Otorgar turno, pasos 2 y 3 (HU-28, con HU-05 + calendario): con el paciente ya elegido,
// profesional y servicio → calendario de los próximos 30 días → click en un horario.
// Todo queda en la URL (paciente incluido), así "Cambiar horario" vuelve con lo elegido.
export default async function DisponibilidadPage({ searchParams }: Props) {
  await exigirRecepcion();
  const params = await searchParams;

  // Sin paciente no se elige hueco "a ciegas": se vuelve al paso 1 conservando lo elegido.
  if (!params.paciente) {
    redirect(urlPasoPaciente(params));
  }
  const idPaciente = params.paciente;

  const [{ data: paciente, error: errorPaciente }, { data: profesionales, error }] =
    await Promise.all([obtenerPaciente(idPaciente), listarProfesionalesParaDisponibilidad()]);

  if (errorPaciente || !paciente) {
    return (
      <section className="modulo">
        <h2>Otorgar turno</h2>
        <PasosTurno actual={1} />
        <p className="mensaje-error" role="alert">
          {errorPaciente ?? "El paciente no existe"}
        </p>
        <Link className="boton-principal boton-inline" href={urlPasoPaciente(params)}>
          Elegir paciente
        </Link>
      </section>
    );
  }

  // Sin elección previa arranca con el primer profesional que tenga horarios libres
  // (así el primer calendario no aparece vacío). Si ninguno tiene, el primero.
  const profesional =
    profesionales.find((p) => p.id_usuario === params.profesional) ??
    (await primeroConLugar(profesionales)) ??
    profesionales[0];
  const servicio =
    profesional?.servicios.find((s) => s.id_servicio === params.servicio) ??
    profesional?.servicios[0];

  // Paso 2 hasta que Recepción elige (o confirma) profesional y servicio; después, paso 3.
  const paso = params.profesional && params.servicio ? 3 : 2;

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Otorgar turno</h2>
          <p className="texto-suave">
            Elegí profesional y servicio, después el día y el horario.
          </p>
        </div>
      </div>

      <PasosTurno actual={paso} />

      {/* Paso 1 ya hecho: el paciente queda a la vista durante todo el turno. */}
      <div className="tarjeta bloque">
        <p>
          Paciente:{" "}
          <strong>
            {paciente.apellido_paciente}, {paciente.nombre_paciente}
          </strong>{" "}
          · DNI {paciente.dni_paciente} ·{" "}
          <Link
            href={urlPasoPaciente({
              profesional: params.profesional,
              servicio: params.servicio,
              fecha: params.fecha,
            })}
          >
            Cambiar
          </Link>
        </p>
      </div>

      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}

      {!profesional || !servicio ? (
        <p className="texto-suave">
          No hay profesionales activos con servicios. Configurá profesionales y franjas
          antes de otorgar turnos.
        </p>
      ) : (
        <>
          <div className="tarjeta bloque">
            <SelectorProfesionalServicio
              paciente={idPaciente}
              profesionales={profesionales}
              profesional={profesional.id_usuario}
              servicio={servicio.id_servicio}
            />
          </div>
          <Calendario
            paciente={idPaciente}
            profesional={profesional.id_usuario}
            servicio={servicio.id_servicio}
            fechaPedida={params.fecha ?? ""}
          />
        </>
      )}
    </section>
  );
}

// Revisa el calendario de los primeros profesionales (con su primer servicio) hasta
// encontrar uno con lugar. Tope de 5 para no demorar la pantalla.
async function primeroConLugar(profesionales: Profesional[]) {
  for (const p of profesionales.slice(0, 5)) {
    const servicio = p.servicios[0]?.id_servicio;
    if (!servicio) continue;
    const { data } = await obtenerCalendario({ id_profesional: p.id_usuario, id_servicio: servicio });
    if (data?.dias.some((d) => d.libres > 0)) return p;
  }
  return undefined;
}

async function Calendario({
  paciente,
  profesional,
  servicio,
  fechaPedida,
}: {
  paciente: string;
  profesional: string;
  servicio: string;
  fechaPedida: string;
}) {
  const { data: calendario, error } = await obtenerCalendario({
    id_profesional: profesional,
    id_servicio: servicio,
  });

  if (error || !calendario) {
    return (
      <p className="mensaje-error" role="alert">
        {error ?? "No se pudo armar el calendario"}
      </p>
    );
  }

  const semanas = armarSemanas(calendario.dias);
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

        <table className="calendario">
          <thead>
            <tr>
              {DIAS_SEMANA.map((dia) => (
                <th key={dia} scope="col">
                  {dia}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((semana, i) => (
              <tr key={i}>
                {semana.map((celda, j) => (
                  <td key={j}>
                    {celda &&
                      (celda.libres > 0 ? (
                        <Link
                          className={`dia-calendario dia-libre${celda.fecha === fecha ? " dia-elegido" : ""}`}
                          href={urlPasoHorario({ paciente, profesional, servicio, fecha: celda.fecha })}
                          aria-current={celda.fecha === fecha ? "date" : undefined}
                          aria-label={`${formatearFecha(celda.fecha)}: ${celda.libres} horarios libres`}
                          scroll={false}
                        >
                          <span className="dia-numero">
                            {celda.dia}
                            {celda.esPrimeroDelMes && <small> {celda.mes}</small>}
                          </span>
                          <span className="dia-libres">
                            {celda.libres}
                            <span className="dia-libres-texto">
                              {celda.libres === 1 ? " libre" : " libres"}
                            </span>
                          </span>
                        </Link>
                      ) : (
                        <span
                          className="dia-calendario dia-sin-lugar"
                          aria-label={`${formatearFecha(celda.fecha)}: sin horarios`}
                        >
                          <span className="dia-numero">
                            {celda.dia}
                            {celda.esPrimeroDelMes && <small> {celda.mes}</small>}
                          </span>
                          <span className="dia-libres">—</span>
                        </span>
                      ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tarjeta" aria-live="polite">
        {fecha ? (
          <Horarios paciente={paciente} profesional={profesional} servicio={servicio} fecha={fecha} />
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

async function Horarios({
  paciente,
  profesional,
  servicio,
  fecha,
}: {
  paciente: string;
  profesional: string;
  servicio: string;
  fecha: string;
}) {
  const { data, error } = await obtenerDisponibilidad({
    id_profesional: profesional,
    id_servicio: servicio,
    fecha,
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
          <p className="texto-suave">Tocá un horario para elegir la cobertura y confirmar.</p>
          <ul className="horarios-botones">
            {data.horarios.map((hora) => (
              <li key={hora}>
                <Link
                  className="horario-boton"
                  href={urlPasoConfirmar({ paciente, profesional, servicio, fecha, hora })}
                >
                  {hora}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
