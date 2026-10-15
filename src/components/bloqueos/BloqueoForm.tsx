"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { crearBloqueo, previsualizarBloqueo, type EstadoBloqueo } from "@/lib/bloqueos/actions";
import {
  domingoDeSemanas,
  lunesDe,
  LARGO_MAXIMO_MOTIVO_BLOQUEO,
  validarBloqueo,
  type CamposBloqueo,
} from "@/lib/bloqueos/validar";
import { formatearFecha } from "@/lib/turnos/validar";

const inicial: EstadoBloqueo = { error: null, guardado: false, turnos: null, campos: null };

function igual(a: CamposBloqueo, b: CamposBloqueo): boolean {
  return (
    a.idProfesional === b.idProfesional &&
    a.desde === b.desde &&
    a.hasta === b.hasta &&
    a.horaDesde === b.horaDesde &&
    a.horaHasta === b.horaHasta &&
    a.motivo.trim() === b.motivo.trim()
  );
}

export function BloqueoForm({
  hoy,
  profesionales,
}: {
  hoy: string;
  profesionales: { id_usuario: string; nombre_usuario: string; apellido_usuario: string }[];
}) {
  const [previa, verAfectados, buscando] = useActionState(previsualizarBloqueo, inicial);
  const [guardado, guardar, guardando] = useActionState(crearBloqueo, inicial);
  const [alcance, setAlcance] = useState<"centro" | "profesional">("centro");
  const [idProfesional, setIdProfesional] = useState(profesionales[0]?.id_usuario ?? "");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [horaDesde, setHoraDesde] = useState("");
  const [horaHasta, setHoraHasta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [semanas, setSemanas] = useState("1");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const campos: CamposBloqueo = {
    idProfesional: alcance === "centro" ? "" : idProfesional,
    desde,
    hasta,
    horaDesde,
    horaHasta,
    motivo,
  };

  function aplicar(tipo: "horas" | "dias" | "semanas") {
    setErrorLocal(null);
    if (tipo === "horas") {
      setHasta(desde);
      if (!horaDesde) setHoraDesde("14:00");
      if (!horaHasta) setHoraHasta("18:00");
    }
    if (tipo === "dias") {
      setHoraDesde("");
      setHoraHasta("");
    }
    if (tipo === "semanas") {
      const cantidad = Math.min(12, Math.max(1, Number(semanas) || 1));
      setDesde(lunesDe(desde));
      setHasta(domingoDeSemanas(desde, cantidad));
      setHoraDesde("");
      setHoraHasta("");
    }
  }

  function revisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const error =
      alcance === "profesional" && !idProfesional
        ? "Elegí un profesional"
        : validarBloqueo(campos, hoy);
    setErrorLocal(error);
    if (error) return;
    const datos = new FormData(evento.currentTarget);
    if (alcance === "centro") datos.set("id_profesional", "");
    startTransition(() => verAfectados(datos));
  }

  const ocupado = buscando || guardando;
  const previaVigente =
    previa.turnos !== null && previa.campos !== null && igual(campos, previa.campos) && !previa.error;
  const error = errorLocal ?? (guardado.guardado ? null : guardado.error) ?? previa.error;

  if (guardado.guardado && guardado.campos && igual(campos, guardado.campos)) {
    return (
      <div className="tarjeta">
        <p className="mensaje-ok" role="status">
          Bloqueo guardado. Los turnos que ya existían no se cancelaron ni se movieron.
        </p>
        <ListaAfectados turnos={guardado.turnos ?? []} />
        <div className="acciones-pie">
          <button
            className="boton-secundario boton-inline"
            type="button"
            onClick={() => {
              setAlcance("centro");
              setDesde(hoy);
              setHasta(hoy);
              setHoraDesde("");
              setHoraHasta("");
              setMotivo("");
              setSemanas("1");
              setErrorLocal(null);
            }}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="tarjeta login-form" onSubmit={revisar}>
      <h3>Nuevo bloqueo</h3>
      <div className="campo">
        <label htmlFor="alcance">Alcance</label>
        <select
          id="alcance"
          value={alcance}
          onChange={(e) => setAlcance(e.target.value as "centro" | "profesional")}
        >
          <option value="centro">Todo el centro</option>
          <option value="profesional">Un profesional</option>
        </select>
      </div>
      {alcance === "profesional" && (
        <div className="campo">
          <label htmlFor="id_profesional">Profesional</label>
          <select
            id="id_profesional"
            name="id_profesional"
            value={idProfesional}
            onChange={(e) => setIdProfesional(e.target.value)}
          >
            {profesionales.map((p) => (
              <option key={p.id_usuario} value={p.id_usuario}>
                {p.apellido_usuario}, {p.nombre_usuario}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="atajos-bloqueo">
        <div className="fila-acciones">
          <button className="boton-pill" type="button" onClick={() => aplicar("horas")}>
            Por horas
          </button>
          <button className="boton-pill" type="button" onClick={() => aplicar("dias")}>
            Por días
          </button>
          <button className="boton-pill" type="button" onClick={() => aplicar("semanas")}>
            Por semanas
          </button>
        </div>
        <div className="campo">
          <label htmlFor="semanas_bloqueo">Semanas</label>
          <input
            id="semanas_bloqueo"
            type="number"
            min={1}
            max={12}
            value={semanas}
            onChange={(e) => setSemanas(e.target.value)}
          />
        </div>
      </div>
      <p className="texto-suave">
        Por horas deja un solo día con horario. Por días bloquea los días completos. Por semanas
        toma de lunes a domingo. Después podés ajustar las fechas y el horario.
      </p>
      <div className="campo">
        <label htmlFor="desde">Desde</label>
        <input id="desde" name="desde" type="date" min={hoy} value={desde} onChange={(e) => setDesde(e.target.value)} required />
      </div>
      <div className="campo">
        <label htmlFor="hasta">Hasta</label>
        <input id="hasta" name="hasta" type="date" min={desde || hoy} value={hasta} onChange={(e) => setHasta(e.target.value)} required />
      </div>
      <div className="campo">
        <label htmlFor="hora_desde">Hora desde (vacío = día completo)</label>
        <input id="hora_desde" name="hora_desde" type="time" value={horaDesde} onChange={(e) => setHoraDesde(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="hora_hasta">Hora hasta</label>
        <input id="hora_hasta" name="hora_hasta" type="time" value={horaHasta} onChange={(e) => setHoraHasta(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="motivo">Motivo</label>
        <input
          id="motivo"
          name="motivo"
          maxLength={LARGO_MAXIMO_MOTIVO_BLOQUEO}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Feriado 8 de diciembre"
          required
        />
        <span className="contador-caracteres">
          {motivo.trim().length} / {LARGO_MAXIMO_MOTIVO_BLOQUEO}
        </span>
      </div>
      {error && !previaVigente && (
        <p className="mensaje-error" role="alert">
          {error}
        </p>
      )}
      <div className="acciones-pie">
        <button className="boton-principal boton-inline" type="submit" disabled={ocupado}>
          {buscando ? "Buscando turnos..." : "Ver turnos afectados"}
        </button>
      </div>
      {previaVigente && (
        <div>
          <ListaAfectados turnos={previa.turnos ?? []} />
          <p className="texto-suave">Se puede guardar igual: los turnos no se cancelan ni se mueven.</p>
          {guardado.error && (
            <p className="mensaje-error" role="alert">
              {guardado.error}
            </p>
          )}
          <button
            className="boton-principal boton-inline"
            type="button"
            disabled={ocupado}
            onClick={() => {
              const datos = new FormData();
              datos.set("id_profesional", campos.idProfesional);
              datos.set("desde", campos.desde);
              datos.set("hasta", campos.hasta);
              datos.set("hora_desde", campos.horaDesde);
              datos.set("hora_hasta", campos.horaHasta);
              datos.set("motivo", campos.motivo);
              startTransition(() => guardar(datos));
            }}
          >
            {guardando ? "Guardando..." : "Guardar bloqueo"}
          </button>
        </div>
      )}
    </form>
  );
}

function ListaAfectados({ turnos }: { turnos: NonNullable<EstadoBloqueo["turnos"]> }) {
  if (turnos.length === 0) {
    return <p className="texto-suave">No hay turnos confirmados en ese horario.</p>;
  }
  return (
    <>
      <p className="texto-suave">
        {turnos.length} {turnos.length === 1 ? "turno confirmado afectado" : "turnos confirmados afectados"}:
      </p>
      <ul className="lista-repetir">
        {turnos.map((t) => (
          <li key={t.id_turno}>
            <Link href={`/turnos/${t.id_turno}`}>
              {t.apellido_paciente}, {t.nombre_paciente} · {formatearFecha(t.fecha)} · {t.hora_inicio} a{" "}
              {t.hora_fin} · {t.apellido_profesional}, {t.nombre_profesional}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
