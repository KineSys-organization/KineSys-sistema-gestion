"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { editarProfesional } from "@/lib/profesionales/actions";
import type { DetalleProfesionalEdicion, EstadoFormulario } from "@/lib/profesionales/tipos";
import type { Servicio } from "@/lib/servicios/tipos";
import { ListaServiciosChecks } from "@/components/profesionales/ListaServiciosChecks";

const vacio: EstadoFormulario = { ok: false, error: null };

export function EdicionProfesionalForm({
  profesional,
  servicios,
}: {
  profesional: DetalleProfesionalEdicion;
  servicios: Servicio[];
}) {
  const [state, action, pending] = useActionState(
    editarProfesional.bind(null, profesional.id_usuario),
    vacio
  );

  const [cambioDesdeAviso, setCambioDesdeAviso] = useState(false);
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    if (state.confirmacion && !cambioDesdeAviso) datos.set("confirmar", "si");
    setCambioDesdeAviso(false);
    startTransition(() => action(datos));
  }

  return (
    <form className="login-form" onSubmit={enviar} onChange={() => setCambioDesdeAviso(true)} noValidate>
      <fieldset className="campos-sin-borde" disabled={pending}>
      <div className="campo">
        <label htmlFor="email">Mail (cuenta de acceso)</label>
        <input
          id="email"
          name="email"
          type="email"
          value={profesional.mail_usuario ?? ""}
          readOnly
          aria-describedby="mail-ayuda"
        />
        <p id="mail-ayuda" className="texto-suave">El mail es el identificador de acceso del profesional y no se puede modificar.</p>
      </div>

      <div className="campo">
        <label htmlFor="nombre_usuario">Nombre</label>
        <input
          id="nombre_usuario"
          name="nombre_usuario"
          defaultValue={profesional.nombre_usuario}
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="apellido_usuario">Apellido</label>
        <input
          id="apellido_usuario"
          name="apellido_usuario"
          defaultValue={profesional.apellido_usuario}
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="fecha_nacimiento_usuario">Fecha de nacimiento</label>
        <input
          id="fecha_nacimiento_usuario"
          name="fecha_nacimiento_usuario"
          type="date"
          defaultValue={profesional.fecha_nacimiento_usuario}
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="dni_usuario">DNI</label>
        <input
          id="dni_usuario"
          name="dni_usuario"
          inputMode="numeric"
          defaultValue={profesional.dni_usuario}
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="telefono_usuario">Teléfono</label>
        <input
          id="telefono_usuario"
          name="telefono_usuario"
          defaultValue={profesional.telefono_usuario}
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="matricula">Matrícula</label>
        <input
          id="matricula"
          name="matricula"
          defaultValue={profesional.matricula}
          required
        />
      </div>

      <fieldset className="campo">
        <legend>Servicios que atiende este profesional</legend>
        <p className="texto-suave">Los servicios marcados ya están asociados. Marcá para agregar o desmarcá para quitar.</p>
        <ListaServiciosChecks
          servicios={servicios}
          seleccionados={profesional.servicios}
        />
      </fieldset>

      </fieldset>
      {state.confirmacion && !cambioDesdeAviso && <p className="aviso-accion" role="alert">{state.confirmacion}</p>}
      {state.error && <p className="mensaje-error" role="alert">{state.error}</p>}

      <div className="fila-acciones">
        <button className="boton-principal" type="submit" disabled={pending}>
          {pending ? "Guardando..." : state.confirmacion && !cambioDesdeAviso ? "Aceptar y guardar" : "Guardar cambios"}
        </button>
        <Link className="boton-secundario boton-inline" href="/profesionales">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
