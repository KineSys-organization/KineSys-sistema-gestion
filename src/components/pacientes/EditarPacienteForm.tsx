"use client";

import { useActionState } from "react";
import { editarPaciente } from "@/lib/pacientes/actions";
import type { EstadoFormulario, ObraSocial, Paciente } from "@/lib/pacientes/tipos";
import { ListaObrasSociales } from "@/components/pacientes/ListaObrasSociales";

const vacio: EstadoFormulario = { ok: false, error: null };

export function EditarPacienteForm({
  paciente,
  obras,
}: {
  paciente: Paciente;
  obras: ObraSocial[];
}) {
  const action = editarPaciente.bind(null, paciente.id_paciente);
  const [estado, formAction, pending] = useActionState(action, vacio);

  return (
    <form className="login-form" action={formAction}>
      <div className="campo">
        <label htmlFor="nombre_paciente">Nombre</label>
        <input
          id="nombre_paciente"
          name="nombre_paciente"
          defaultValue={paciente.nombre_paciente}
          required
        />
      </div>
      <div className="campo">
        <label htmlFor="apellido_paciente">Apellido</label>
        <input
          id="apellido_paciente"
          name="apellido_paciente"
          defaultValue={paciente.apellido_paciente}
          required
        />
      </div>
      <div className="campo">
        <label htmlFor="dni_paciente">DNI</label>
        <input
          id="dni_paciente"
          value={paciente.dni_paciente}
          disabled
          readOnly
        />
        <p className="texto-ayuda">El DNI no se puede modificar.</p>
      </div>
      <div className="campo">
        <label htmlFor="fecha_nacimiento_paciente">Fecha de nacimiento</label>
        <input
          id="fecha_nacimiento_paciente"
          type="date"
          value={paciente.fecha_nacimiento_paciente}
          disabled
          readOnly
        />
        <p className="texto-ayuda">La fecha de nacimiento no se puede modificar.</p>
      </div>
      <div className="campo">
        <label htmlFor="telefono_paciente">Teléfono</label>
        <input
          id="telefono_paciente"
          name="telefono_paciente"
          defaultValue={paciente.telefono_paciente}
          required
        />
      </div>
      <div className="campo">
        <label htmlFor="mail_paciente">Email</label>
        <input
          id="mail_paciente"
          name="mail_paciente"
          type="email"
          defaultValue={paciente.mail_paciente}
          required
        />
      </div>

      <fieldset className="fieldset-obras">
        <legend>Obras sociales</legend>
        <ListaObrasSociales obras={obras} seleccionadas={paciente.obras_sociales} />
      </fieldset>

      {estado.error && <p className="mensaje-error" role="alert">{estado.error}</p>}
      {estado.ok && <p className="mensaje-ok">Datos actualizados</p>}

      <button className="boton-principal" type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar cambios"}
      </button>
    </form>
  );
}
