import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirPaciente } from "@/lib/portal/acceso";
import {
  obtenerCalendarioPortal,
  obtenerCatalogo,
  obtenerHorariosPortal,
} from "@/lib/portal/actions";
import {
  formatearPrecio,
  limpiarDatos,
  pasoPortal,
  PASOS_PORTAL,
  urlPortalNuevo,
  type DatosPortal,
} from "@/lib/portal/validar";
import { diaSeleccionado } from "@/lib/disponibilidad/calendario";
import { formatearFecha } from "@/lib/turnos/validar";
import { CalendarioDias } from "@/components/disponibilidad/CalendarioDias";
import { SacarTurnoForm } from "@/components/portal/SacarTurnoForm";

type Props = {
  searchParams: Promise<DatosPortal>;
};

// HU-23. Sacar turno online: 1 servicio → 2 profesional → 3 día y horario → 4 confirmar.
// Todo lo elegido queda en la URL (como en HU-28), así "Cambiar" vuelve con lo anterior.
export default async function SacarTurnoPage({ searchParams }: Props) {
  const paciente = await exigirPaciente();
  const pedidos = await searchParams;
  const datos = limpiarDatos(pedidos);
  const { data: catalogo, error } = await obtenerCatalogo();

  const servicio = catalogo.find((s) => s.id_servicio === datos.servicio);
  const profesional = servicio?.profesionales.find((p) => p.id_profesional === datos.profesional);

  // Un servicio con un solo profesional: se saltea el paso 2.
  if (servicio && !datos.profesional && servicio.profesionales.length === 1) {
    redirect(urlPortalNuevo({ servicio: servicio.id_servicio, profesional: servicio.profesionales[0].id_profesional }));
  }

  // Un servicio o profesional que ya no está en el catálogo vuelve al paso que corresponde.
  if (datos.servicio && !servicio) redirect(urlPortalNuevo());
  if (datos.profesional && !profesional) redirect(urlPortalNuevo({ servicio: datos.servicio }));

  const paso = pasoPortal(datos);

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Sacar turno</h2>
          <p className="texto-suave">Elegí el servicio, el profesional, el día y el horario.</p>
        </div>
      </div>

      <ol className="pasos-turno" aria-label="Pasos para sacar un turno">
        {PASOS_PORTAL.map((nombre, i) => {
          const numero = i + 1;
          const estado = numero < paso ? "hecho" : numero === paso ? "actual" : "pendiente";
          return (
            <li key={nombre} className={`paso paso-${estado}`} aria-current={estado === "actual" ? "step" : undefined}>
              <span className="paso-numero" aria-hidden="true">
                {estado === "hecho" ? "✓" : numero}
              </span>
              <span>{nombre}</span>
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}

      {/* Lo ya elegido queda a la vista, con su "Cambiar". */}
      {servicio && (
        <div className="tarjeta bloque">
          <p>
            Servicio: <strong>{servicio.nombre_servicio}</strong> · {servicio.duracion_minutos} min ·{" "}
            <Link href={urlPortalNuevo()}>Cambiar</Link>
          </p>
          {profesional && (
            <p>
              Profesional:{" "}
              <strong>
                {profesional.nombre_profesional} {profesional.apellido_profesional}
              </strong>
              {servicio.profesionales.length > 1 && (
                <>
                  {" "}
                  · <Link href={urlPortalNuevo({ servicio: servicio.id_servicio })}>Cambiar</Link>
                </>
              )}
            </p>
          )}
        </div>
      )}

      {paso === 1 && (
        <section className="tarjeta bloque">
          <h3>¿Qué servicio necesitás?</h3>
          {catalogo.length === 0 ? (
            <p className="texto-suave">
              Por ahora no hay servicios para reservar online. Comunicate con Recepción.
            </p>
          ) : (
            <ul className="horarios-botones">
              {catalogo.map((s) => (
                <li key={s.id_servicio}>
                  <Link className="horario-boton" href={urlPortalNuevo({ servicio: s.id_servicio })}>
                    {s.nombre_servicio}
                    <span className="texto-suave">
                      {" "}
                      · {s.duracion_minutos} min
                      {formatearPrecio(s.precio_servicio) && ` · ${formatearPrecio(s.precio_servicio)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="texto-suave">
            El precio es el valor particular de referencia; con obra social puede cambiar.
          </p>
        </section>
      )}

      {paso === 2 && servicio && (
        <section className="tarjeta bloque">
          <h3>¿Con qué profesional?</h3>
          <ul className="horarios-botones">
            {servicio.profesionales.map((p) => (
              <li key={p.id_profesional}>
                <Link
                  className="horario-boton"
                  href={urlPortalNuevo({ servicio: servicio.id_servicio, profesional: p.id_profesional })}
                >
                  {p.nombre_profesional} {p.apellido_profesional}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {paso === 3 && servicio && profesional && (
        <DiaYHorario servicio={servicio.id_servicio} profesional={profesional.id_profesional} fechaPedida={datos.fecha ?? ""} />
      )}

      {paso === 4 && servicio && profesional && datos.fecha && datos.hora && (
        <section className="tarjeta bloque">
          <h3>Confirmá tu turno</h3>
          <p>
            <strong>{formatearFecha(datos.fecha)}</strong> a las <strong>{datos.hora}</strong> ·{" "}
            <Link href={urlPortalNuevo({ ...datos, hora: undefined })}>Cambiar horario</Link>
          </p>
          <SacarTurnoForm
            obras={paciente.obras_sociales}
            idServicio={servicio.id_servicio}
            idProfesional={profesional.id_profesional}
            fecha={datos.fecha}
            hora={datos.hora}
          />
        </section>
      )}
    </section>
  );
}

async function DiaYHorario({
  servicio,
  profesional,
  fechaPedida,
}: {
  servicio: string;
  profesional: string;
  fechaPedida: string;
}) {
  const { data: calendario, error } = await obtenerCalendarioPortal(profesional, servicio);

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
        </div>
        {totalLibres === 0 && (
          <p className="aviso-accion">
            No hay horarios libres en los próximos 30 días. Probá con otro profesional o
            comunicate con Recepción.
          </p>
        )}
        <CalendarioDias
          dias={calendario.dias}
          fechaElegida={fecha}
          hrefDia={(dia) => urlPortalNuevo({ servicio, profesional, fecha: dia })}
        />
      </section>

      <section className="tarjeta" aria-live="polite">
        {fecha ? (
          <Horarios servicio={servicio} profesional={profesional} fecha={fecha} />
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
  servicio,
  profesional,
  fecha,
}: {
  servicio: string;
  profesional: string;
  fecha: string;
}) {
  const { data, error } = await obtenerHorariosPortal(profesional, servicio, fecha);

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
          <p className="texto-suave">Tocá un horario para confirmarlo.</p>
          <ul className="horarios-botones">
            {data.horarios.map((hora) => (
              <li key={hora}>
                <Link className="horario-boton" href={urlPortalNuevo({ servicio, profesional, fecha, hora })}>
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
