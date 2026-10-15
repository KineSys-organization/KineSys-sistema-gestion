"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { guardarHistoriaClinica } from "@/lib/historia-clinica/actions";
import type { CamposFicha, EstadoHistoria } from "@/lib/historia-clinica/tipos";
import { CAMPOS_FICHA, LARGO_MAXIMO_CAMPO_FICHA } from "@/lib/historia-clinica/validar";

const inicial: EstadoHistoria = { ok: false, error: null };

type Props = {
  idPaciente: string;
  idTurno: string | null;
  ficha: CamposFicha | null; // null = se completa por primera vez
  urlCancelar: string;
};

// HU-39. Formulario de la ficha clínica. Es cliente por useActionState y para
// mostrar cuántos caracteres quedan en cada campo.
export function HistoriaClinicaForm({ idPaciente, idTurno, ficha, urlCancelar }: Props) {
  // Controlados: si la base devuelve un error, no se pierde lo escrito.
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS_FICHA.map((c) => [c.nombre, ficha?.[c.nombre] ?? ""]))
  );
  const [estado, action, pending] = useActionState(guardarHistoriaClinica, inicial);

  return (
    <form className="tarjeta login-form form-historia" action={action}>
      <h3>{ficha ? "Editar historia clínica" : "Completar historia clínica"}</h3>
      <p className="texto-suave">
        Cada campo es opcional; completá al menos uno para guardar (máximo {LARGO_MAXIMO_CAMPO_FICHA}
        caracteres por campo).
        {ficha && " Al guardar, la versión anterior queda en el historial de cambios."}
      </p>
      <input type="hidden" name="id_paciente" value={idPaciente} />
      {idTurno && <input type="hidden" name="id_turno" value={idTurno} />}

      {CAMPOS_FICHA.map((campo) => (
        <div className="campo" key={campo.nombre}>
          <label htmlFor={campo.nombre}>{campo.etiqueta}</label>
          <textarea
            id={campo.nombre}
            name={campo.nombre}
            rows={3}
            maxLength={LARGO_MAXIMO_CAMPO_FICHA}
            value={valores[campo.nombre]}
            onChange={(event) =>
              setValores((previos) => ({ ...previos, [campo.nombre]: event.target.value }))
            }
            placeholder={campo.ayuda}
            aria-describedby={`${campo.nombre}_contador`}
          />
          <span id={`${campo.nombre}_contador`} className="contador-caracteres">
            {valores[campo.nombre].length} / {LARGO_MAXIMO_CAMPO_FICHA}
          </span>
        </div>
      ))}

      {estado.error && (
        <p className="mensaje-error" role="alert">
          {estado.error}
        </p>
      )}

      <div className="fila-acciones">
        <button className="boton-principal boton-inline" type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar historia clínica"}
        </button>
        <Link className="boton-secundario boton-inline" href={urlCancelar}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
