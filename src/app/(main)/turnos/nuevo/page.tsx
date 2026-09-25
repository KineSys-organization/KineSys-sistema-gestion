import Link from "next/link";
import type { ReactNode } from "react";
import { exigirRecepcion } from "@/lib/auth";
import { obtenerDisponibilidad } from "@/lib/disponibilidad/actions";
import { urlDisponibilidad } from "@/lib/disponibilidad/calendario";
import { buscarPacientes, obtenerPaciente } from "@/lib/pacientes/actions";
import { formatearFecha, MENSAJE_NO_DISPONIBLE } from "@/lib/turnos/validar";
import { OtorgarTurnoForm } from "@/components/turnos/OtorgarTurnoForm";
import { PasosTurno } from "@/components/turnos/PasosTurno";

type Props = {
  searchParams: Promise<{
    profesional?: string;
    servicio?: string;
    fecha?: string;
    hora?: string;
    q?: string;
    paciente?: string;
  }>;
};

export default async function OtorgarTurnoPage({ searchParams }: Props) {
  await exigirRecepcion();
  const params = await searchParams;

  const horario = {
    profesional: params.profesional ?? "",
    servicio: params.servicio ?? "",
    fecha: params.fecha ?? "",
    hora: params.hora ?? "",
  };

  // Volver al paso 1 con el profesional, el servicio y el día ya elegidos.
  const cambiarHorario = urlDisponibilidad(horario);

  // Llegamos acá desde un horario del paso 1 (/disponibilidad).
  if (!horario.profesional || !horario.servicio || !horario.fecha || !horario.hora) {
    return (
      <Pantalla paso={1}>
        <p className="texto-suave">
          Primero elegí un horario en <Link href="/disponibilidad">Otorgar turno</Link>.
        </p>
      </Pantalla>
    );
  }

  // Se vuelve a consultar HU-05 para mostrar los datos y avisar si el horario ya se ocupó.
  const disponibilidad = await obtenerDisponibilidad({
    id_profesional: horario.profesional,
    id_servicio: horario.servicio,
    fecha: horario.fecha,
  });

  const data = disponibilidad.data;
  const error =
    disponibilidad.error ??
    (data && !data.horarios.includes(horario.hora) ? MENSAJE_NO_DISPONIBLE : null);

  if (error || !data) {
    return (
      <Pantalla paso={1}>
        <p className="mensaje-error" role="alert">
          {error ?? MENSAJE_NO_DISPONIBLE}
        </p>
        <p>
          <Link className="boton-principal boton-inline" href={cambiarHorario}>
            Elegir otro horario
          </Link>
        </p>
      </Pantalla>
    );
  }

  // Parámetros del horario para armar los links sin perderlos.
  const base = new URLSearchParams(horario);
  const consulta = (params.q ?? "").trim();

  return (
    <Pantalla paso={params.paciente ? 3 : 2}>
      <div className="modulo-grid">
        <section className="tarjeta">
          <h3>Horario elegido</h3>
          <dl className="resumen-turno">
            <dt>Profesional</dt>
            <dd>
              {data.apellido_profesional}, {data.nombre_profesional}
            </dd>
            <dt>Servicio</dt>
            <dd>
              {data.nombre_servicio} ({data.duracion_minutos} min)
            </dd>
            <dt>Día</dt>
            <dd>{formatearFecha(data.fecha)}</dd>
            <dt>Hora</dt>
            <dd>{horario.hora}</dd>
          </dl>
          <Link className="boton-secundario boton-inline" href={cambiarHorario}>
            Cambiar horario
          </Link>
        </section>

        <section className="tarjeta">
          {params.paciente ? (
            <PasoConfirmar
              idPaciente={params.paciente}
              horario={horario}
              volver={`/turnos/nuevo?${base.toString()}`}
            />
          ) : (
            <PasoPaciente base={base} consulta={consulta} />
          )}
        </section>
      </div>
    </Pantalla>
  );
}

function Pantalla({ paso, children }: { paso: 1 | 2 | 3; children: ReactNode }) {
  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Otorgar turno</h2>
          <p className="texto-suave">
            Elegí el paciente y la cobertura, y confirmá el turno.
          </p>
        </div>
      </div>
      <PasosTurno actual={paso} />
      {children}
    </section>
  );
}

// Paso 2: localizar al paciente (reutiliza la búsqueda de HU-04).
async function PasoPaciente({
  base,
  consulta,
}: {
  base: URLSearchParams;
  consulta: string;
}) {
  const { data, error } = await buscarPacientes(consulta);

  function urlElegir(idPaciente: string) {
    const params = new URLSearchParams(base);
    params.set("paciente", idPaciente);
    return `/turnos/nuevo?${params.toString()}`;
  }

  // Si el paciente no existe, el alta vuelve acá con el paciente ya elegido.
  const registrarNuevo = `/pacientes/nuevo?volver=${encodeURIComponent(
    `/turnos/nuevo?${base.toString()}`
  )}`;

  return (
    <>
      <h3>Paciente</h3>
      <form className="busqueda-pacientes" method="get">
        {[...base.entries()].map(([clave, valor]) => (
          <input key={clave} type="hidden" name={clave} value={valor} />
        ))}
        <div className="campo">
          <label htmlFor="q">Buscar</label>
          <input
            id="q"
            name="q"
            defaultValue={consulta}
            placeholder="DNI o nombre / apellido"
            autoFocus
          />
        </div>
        <button className="boton-principal boton-inline" type="submit">
          Buscar
        </button>
      </form>

      {error && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}

      {!consulta ? (
        <p className="texto-suave">
          Ingresá un DNI o un nombre para buscar. ¿Es un paciente nuevo?{" "}
          <Link href={registrarNuevo}>Registralo</Link> y volvés acá.
        </p>
      ) : data.length === 0 ? (
        <div className="aviso-accion">
          <p>No se encontraron pacientes con “{consulta}”.</p>
          <Link className="boton-principal boton-inline" href={registrarNuevo}>
            Registrar paciente nuevo
          </Link>
        </div>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DNI</th>
                <th>Obras sociales</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((paciente) => (
                <tr key={paciente.id_paciente}>
                  <td>
                    {paciente.apellido_paciente}, {paciente.nombre_paciente}
                  </td>
                  <td>{paciente.dni_paciente}</td>
                  <td>
                    {paciente.obras_sociales
                      .map((obra) => obra.nombre_obra_social)
                      .join(", ") || "Particular"}
                  </td>
                  <td>
                    <Link
                      className="boton-pill boton-pill-fuerte"
                      href={urlElegir(paciente.id_paciente)}
                    >
                      Elegir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Paso 3: cobertura y confirmación.
async function PasoConfirmar({
  idPaciente,
  horario,
  volver,
}: {
  idPaciente: string;
  horario: { profesional: string; servicio: string; fecha: string; hora: string };
  volver: string;
}) {
  const { data: paciente, error } = await obtenerPaciente(idPaciente);

  if (error || !paciente) {
    return (
      <>
        <p className="mensaje-error" role="alert">
          {error ?? "El paciente no existe"}
        </p>
        <Link href={volver}>Elegir otro paciente</Link>
      </>
    );
  }

  return (
    <>
      <h3>Paciente</h3>
      <p>
        <strong>
          {paciente.apellido_paciente}, {paciente.nombre_paciente}
        </strong>{" "}
        · DNI {paciente.dni_paciente} · <Link href={volver}>Cambiar</Link>
      </p>
      <OtorgarTurnoForm
        idPaciente={paciente.id_paciente}
        obras={paciente.obras_sociales}
        idProfesional={horario.profesional}
        idServicio={horario.servicio}
        fecha={horario.fecha}
        hora={horario.hora}
      />
    </>
  );
}
