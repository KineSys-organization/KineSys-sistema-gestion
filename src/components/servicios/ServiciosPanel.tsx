"use client";

import { useActionState, useState } from "react";
import {
  alternarServicio,
  editarServicio,
  registrarServicio,
} from "@/lib/servicios/actions";
import type { EstadoFormulario, Servicio } from "@/lib/servicios/tipos";

const vacio: EstadoFormulario = { ok: false, error: null };

// HU-08: sin permiso de gestión (Mesa de Entradas) solo se muestra la tabla, sin formulario ni botones.
export function ServiciosPanel({
  servicios,
  puedeGestionar,
}: {
  servicios: Servicio[];
  puedeGestionar: boolean;
}) {
  if (!puedeGestionar) {
    return (
      <section className="tarjeta">
        <h3>Servicios cargados</h3>
        <TablaServicios servicios={servicios} />
      </section>
    );
  }

  return <ServiciosGestion servicios={servicios} />;
}

function ServiciosGestion({ servicios }: { servicios: Servicio[] }) {
  const [editando, setEditando] = useState<Servicio | null>(null);
  const [altaState, altaAction, altaPending] = useActionState(registrarServicio, vacio);
  const [edicionState, edicionAction, edicionPending] = useActionState(editarServicio, vacio);
  const [mensajeLista, setMensajeLista] = useState<string | null>(null);

  async function alAlternar(id: string) {
    const resultado = await alternarServicio(id);
    setMensajeLista(resultado.error);
  }

  return (
    <div className="modulo-grid">
      <section className="tarjeta">
        <h3>{editando ? "Editar servicio" : "Nuevo servicio"}</h3>

        {editando ? (
          <form className="login-form" action={edicionAction} key={editando.id_servicio}>
            <input type="hidden" name="id_servicio" value={editando.id_servicio} />
            <CamposServicio servicio={editando} />
            {edicionState.error && <p className="mensaje-error">{edicionState.error}</p>}
            {edicionState.ok && <p className="mensaje-ok">Servicio actualizado</p>}
            <div className="fila-acciones">
              <button className="boton-principal" type="submit" disabled={edicionPending}>
                {edicionPending ? "Guardando..." : "Guardar cambios"}
              </button>
              <button className="boton-secundario" type="button" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <form className="login-form" action={altaAction}>
            <CamposServicio />
            {altaState.error && <p className="mensaje-error">{altaState.error}</p>}
            {altaState.ok && <p className="mensaje-ok">Servicio creado</p>}
            <button className="boton-principal" type="submit" disabled={altaPending}>
              {altaPending ? "Guardando..." : "Registrar servicio"}
            </button>
          </form>
        )}
      </section>

      <section className="tarjeta">
        <h3>Servicios cargados</h3>
        {mensajeLista && <p className="mensaje-error">{mensajeLista}</p>}
        <TablaServicios
          servicios={servicios}
          acciones={(servicio) => (
            <div className="fila-acciones">
              <button
                className="boton-pill"
                type="button"
                onClick={() => setEditando(servicio)}
              >
                Editar
              </button>
              <button
                className="boton-pill"
                type="button"
                onClick={() => alAlternar(servicio.id_servicio)}
              >
                {servicio.activo ? "Desactivar" : "Activar"}
              </button>
            </div>
          )}
        />
      </section>
    </div>
  );
}

// Tabla compartida. Sin `acciones` (solo lectura) no se dibuja la columna de botones.
function TablaServicios({
  servicios,
  acciones,
}: {
  servicios: Servicio[];
  acciones?: (servicio: Servicio) => React.ReactNode;
}) {
  if (servicios.length === 0) {
    return <p className="texto-suave">Todavía no hay servicios.</p>;
  }

  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Duración</th>
          <th>Granularidad</th>
          <th>Precio</th>
          <th>Estado</th>
          {acciones && <th></th>}
        </tr>
      </thead>
      <tbody>
        {servicios.map((servicio) => (
          <tr key={servicio.id_servicio}>
            <td>{servicio.nombre_servicio}</td>
            <td>{servicio.duracion_minutos} min</td>
            <td>{servicio.granularidad_minutos} min</td>
            <td>
              {servicio.precio_servicio == null
                ? "—"
                : `$${servicio.precio_servicio}`}
            </td>
            <td>
              <span className={servicio.activo ? "badge-activo" : "badge-inactivo"}>
                {servicio.activo ? "Activo" : "Inactivo"}
              </span>
            </td>
            {acciones && <td>{acciones(servicio)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CamposServicio({ servicio }: { servicio?: Servicio }) {
  return (
    <>
      <div className="campo">
        <label htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          name="nombre"
          defaultValue={servicio?.nombre_servicio ?? ""}
        />
      </div>
      <div className="campo">
        <label htmlFor="duracion">Duración (minutos)</label>
        <input
          id="duracion"
          name="duracion"
          type="number"
          min={1}
          step={1}
          defaultValue={servicio?.duracion_minutos ?? ""}
        />
      </div>
      <div className="campo">
        <label htmlFor="granularidad">Granularidad (minutos)</label>
        <input
          id="granularidad"
          name="granularidad"
          type="number"
          min={1}
          step={1}
          defaultValue={servicio?.granularidad_minutos ?? ""}
        />
      </div>
      <div className="campo">
        <label htmlFor="precio">Precio (opcional)</label>
        <input
          id="precio"
          name="precio"
          type="number"
          min={0}
          step="0.01"
          defaultValue={servicio?.precio_servicio ?? ""}
        />
      </div>
    </>
  );
}
