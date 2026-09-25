import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import {
  listarProfesionalesParaDisponibilidad,
  obtenerCalendario,
  obtenerDisponibilidad,
} from "@/lib/disponibilidad/actions";
import {
  armarSemanas,
  DIAS_SEMANA,
  diaSeleccionado,
  urlDisponibilidad,
} from "@/lib/disponibilidad/calendario";
import { formatearFecha } from "@/lib/turnos/validar";
import type { Profesional } from "@/lib/profesionales/tipos";
import { PasosTurno } from "@/components/turnos/PasosTurno";
import { SelectorProfesionalServicio } from "@/components/disponibilidad/SelectorProfesionalServicio";

type Props = {
  searchParams: Promise<{ profesional?: string; servicio?: string; fecha?: string }>;
};

// HU-06 paso 2: cada horario libre lleva a elegir el paciente con los datos ya cargados.
function urlOtorgar(profesional: string, servicio: string, fecha: string, hora: string) {
  const params = new URLSearchParams({ profesional, servicio, fecha, hora });
  return `/turnos/nuevo?${params.toString()}`;
}

// Otorgar turno, paso 1 (HU-05 + calendario): profesional y servicio → calendario de
// los próximos 30 días con los horarios libres de cada día → click en un horario.
// Todo queda en la URL, así "Cambiar horario" vuelve con lo elegido.
export default async function DisponibilidadPage({ searchParams }: Props) {
  await exigirRecepcion();
  const params = await searchParams;
  const { data: profesionales, error } = await listarProfesionalesParaDisponibilidad();

  // Sin elección previa arranca con el primer profesional que tenga horarios libres
  // (así el primer calendario no aparece vacío). Si ninguno tiene, el primero.
  const profesional =
    profesionales.find((p) => p.id_usuario === params.profesional) ??
    (await primeroConLugar(profesionales)) ??
    profesionales[0];
  const servicio =
    profesional?.servicios.find((s) => s.id_servicio === params.servicio) ??
    profesional?.servicios[0];

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

      <PasosTurno actual={1} />

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
              profesionales={profesionales}
              profesional={profesional.id_usuario}
              servicio={servicio.id_servicio}
            />
          </div>
          <Calendario
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
  profesional,
  servicio,
  fechaPedida,
}: {
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
                          href={urlDisponibilidad({ profesional, servicio, fecha: celda.fecha })}
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
          <Horarios profesional={profesional} servicio={servicio} fecha={fecha} />
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
  profesional,
  servicio,
  fecha,
}: {
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
          <p className="texto-suave">Tocá un horario para elegir el paciente.</p>
          <ul className="horarios-botones">
            {data.horarios.map((hora) => (
              <li key={hora}>
                <Link
                  className="horario-boton"
                  href={urlOtorgar(profesional, servicio, fecha, hora)}
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
