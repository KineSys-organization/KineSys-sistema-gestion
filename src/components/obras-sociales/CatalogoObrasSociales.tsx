"use client";

import { useState } from "react";
import { AltaObraSocialForm } from "@/components/obras-sociales/AltaObraSocialForm";
import { BotonEstadoObraSocial } from "@/components/obras-sociales/BotonEstadoObraSocial";
import { EdicionObraSocialForm } from "@/components/obras-sociales/EdicionObraSocialForm";
import type { ObraSocialCatalogo } from "@/lib/obras-sociales/tipos";

export function CatalogoObrasSociales({ obras }: { obras: ObraSocialCatalogo[] }) {
  const [editando, setEditando] = useState<ObraSocialCatalogo | null>(null);
  const [mensajeLista, setMensajeLista] = useState<string | null>(null);

  return (
    <div className="modulo-grid">
      <section className="tarjeta">
        {editando ? (
          <>
            <h3>Editar obra social</h3>
            <EdicionObraSocialForm obra={editando} onCancelar={() => setEditando(null)} />
          </>
        ) : (
          <>
            <h3>Registrar obra social</h3>
            <AltaObraSocialForm />
          </>
        )}
      </section>

      <section className="tarjeta">
        <h3>Obras sociales cargadas</h3>
        {mensajeLista && <p className="mensaje-error" role="alert">{mensajeLista}</p>}
        {obras.length === 0 ? (
          <p className="texto-suave">Todavía no hay obras sociales en el catálogo.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {obras.map((obra) => (
                <tr key={obra.id_obra_social}>
                  <td>{obra.nombre_obra_social}</td>
                  <td>
                    <span className={obra.activo ? "badge-activo" : "badge-inactivo"}>
                      {obra.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td>
                    <div className="fila-acciones">
                      <button
                        className="boton-pill"
                        type="button"
                        onClick={() => setEditando(obra)}
                      >
                        Editar
                      </button>
                      <BotonEstadoObraSocial obra={obra} onError={setMensajeLista} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
