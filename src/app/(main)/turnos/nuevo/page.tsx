import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { exigirRecepcion } from "@/lib/auth";
import { obtenerDisponibilidad } from "@/lib/disponibilidad/actions";
import { buscarPacientes, obtenerPaciente } from "@/lib/pacientes/actions";
import {
  tieneHorario,
  urlPasoHorario,
  urlPasoPaciente,
  type DatosFlujo,
  type NumeroPaso,
} from "@/lib/turnos/flujo";
import { formatearFecha, MENSAJE_NO_DISPONIBLE } from "@/lib/turnos/validar";
import { OtorgarTurnoForm } from "@/components/turnos/OtorgarTurnoForm";
import { PasosTurno } from "@/components/turnos/PasosTurno";

type Props = {
  searchParams: Promise<DatosFlujo & { q?: string }>;
};

// HU-28. "Otorgar turno" empieza acá, por el paciente.
// - Sin paciente: paso 1 (buscar o registrar).
// - Con paciente y sin horario: vuelve a los pasos 2 y 3 (/disponibilidad).
// - Con paciente y horario: pasos 4 y 5 (cobertura y confirmar).
export default async function OtorgarTurnoPage({ searchParams }: Props) {
  await exigirRecepcion();
  const params = await searchParams;

  const datos: DatosFlujo = {
    paciente: params.paciente ?? "",
    profesional: params.profesional ?? "",
    servicio: params.servicio ?? "",
    fecha: params.fecha ?? "",
    hora: params.hora ?? "",
  };

  // Paso 1: sin paciente elegido no se avanza.
  if (!datos.paciente) {
    return (
      <Pantalla paso={1} texto="Buscá al paciente por DNI o nombre, o registralo si es nuevo.">
        <section className="tarjeta">
          <PasoPaciente datos={datos} consulta={(params.q ?? "").trim()} />
        </section>
      </Pantalla>
    );
  }

  // Paciente elegido pero todavía sin horario: pasos 2 y 3.
  if (!tieneHorario(datos)) {
    redirect(urlPasoHorario(datos));
  }

  // Pasos 4 y 5. Se vuelve a consultar HU-05 para mostrar los datos y avisar si el
  // horario ya se ocupó (al confirmar, la base lo revalida con lock).
  const cambiarHorario = urlPasoHorario(datos);
  const disponibilidad = await obtenerDisponibilidad({
    id_profesional: datos.profesional ?? "",
    id_servicio: datos.servicio ?? "",
    fecha: datos.fecha ?? "",
  });

  const data = disponibilidad.data;
  const error =
    disponibilidad.error ??
    (data && !data.horarios.includes(datos.hora ?? "") ? MENSAJE_NO_DISPONIBLE : null);

  if (error || !data) {
    return (
      <Pantalla paso={3} texto="El horario elegido no se puede usar.">
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

  return (
    <Pantalla paso={4} texto="Elegí la cobertura y confirmá el turno.">
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
            <dd>{datos.hora}</dd>
          </dl>
          <Link className="boton-secundario boton-inline" href={cambiarHorario}>
            Cambiar horario
          </Link>
        </section>

        <section className="tarjeta">
          <PasoConfirmar datos={datos} />
        </section>
      </div>
    </Pantalla>
  );
}

function Pantalla({
  paso,
  texto,
  children,
}: {
  paso: NumeroPaso;
  texto: string;
  children: ReactNode;
}) {
  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Otorgar turno</h2>
          <p className="texto-suave">{texto}</p>
        </div>
      </div>
      <PasosTurno actual={paso} />
      {children}
    </section>
  );
}

// Paso 1: localizar al paciente (reutiliza la búsqueda de HU-04).
// Si venía profesional/servicio/fecha (desde la Agenda o "Cambiar paciente"), se conservan.
async function PasoPaciente({ datos, consulta }: { datos: DatosFlujo; consulta: string }) {
  const { data, error } = await buscarPacientes(consulta);

  // Lo ya elegido del horario viaja en campos ocultos del buscador (solo lo que tiene valor).
  const preseleccion = (["profesional", "servicio", "fecha"] as const)
    .map((clave) => [clave, datos[clave] ?? ""] as const)
    .filter(([, valor]) => valor);

  // Si el paciente no existe, el alta vuelve a este paso con el paciente ya elegido
  // (y desde acá se sigue solo al paso 2).
  const registrarNuevo = `/pacientes/nuevo?volver=${encodeURIComponent(urlPasoPaciente(datos))}`;

  return (
    <>
      <h3>Paciente</h3>
      <form className="busqueda-pacientes" method="get">
        {preseleccion.map(([clave, valor]) => (
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
          <Link href={registrarNuevo}>Registralo</Link> y seguís con el turno.
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
                      href={urlPasoHorario({ ...datos, paciente: paciente.id_paciente })}
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

// Pasos 4 y 5: cobertura y confirmación.
async function PasoConfirmar({ datos }: { datos: DatosFlujo }) {
  const { data: paciente, error } = await obtenerPaciente(datos.paciente ?? "");

  // "Cambiar paciente" vuelve al paso 1 sin perder profesional, servicio ni fecha.
  const cambiarPaciente = urlPasoPaciente(datos);

  if (error || !paciente) {
    return (
      <>
        <p className="mensaje-error" role="alert">
          {error ?? "El paciente no existe"}
        </p>
        <Link href={cambiarPaciente}>Elegir otro paciente</Link>
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
        · DNI {paciente.dni_paciente} · <Link href={cambiarPaciente}>Cambiar</Link>
      </p>
      <OtorgarTurnoForm
        idPaciente={paciente.id_paciente}
        obras={paciente.obras_sociales}
        idProfesional={datos.profesional ?? ""}
        idServicio={datos.servicio ?? ""}
        fecha={datos.fecha ?? ""}
        hora={datos.hora ?? ""}
      />
    </>
  );
}
