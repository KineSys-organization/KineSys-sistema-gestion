import type { Comprobante } from "@/lib/pagos/tipos";
import {
  etiquetaMedio,
  formatearMomento,
  formatearNumeroComprobante,
  formatearPesos,
} from "@/lib/pagos/validar";
import { formatearFecha } from "@/lib/turnos/validar";
import { EstadoTurnoBadge } from "@/components/turnos/EstadoTurnoBadge";
import { EstadoCobroBadge } from "@/components/pagos/EstadoCobroBadge";

// HU-35. Comprobante de pago: se ve en pantalla y es lo único que sale al imprimir
// (clase "imprimible", mismo estilo que el PDF de horarios de HU-27).
// Se arma cada vez con los datos de la base: si el pago se corrigió o se reembolsó, lo dice.
export function ComprobantePago({ comprobante: c }: { comprobante: Comprobante }) {
  return (
    <article className="comprobante imprimible" aria-label="Comprobante de pago">
      <header className="encabezado-impresion">
        <div className="marca-impresion">
          <img src="/logo-kinesys.svg" alt="" />
          <span>KineSys</span>
        </div>
        <p>Consultorio de kinesiología</p>
      </header>

      <div className="titulo-horario-impresion">
        <p className="etiqueta-impresion">COMPROBANTE DE PAGO</p>
        <h2 className="titulo-profesional">Nº {formatearNumeroComprobante(c.numero_comprobante)}</h2>
        <p className="texto-suave">Emitido el {formatearMomento(c.emitido_en)}</p>
      </div>

      {/* Leyendas: el comprobante muestra siempre los datos vigentes. */}
      {c.corregido_en && (
        <p className="leyenda-comprobante">Corregido el {formatearMomento(c.corregido_en)}</p>
      )}
      {c.reembolso && (
        <p className="leyenda-comprobante leyenda-reembolso">
          Reembolsado el {formatearMomento(c.reembolso.registrado_en)} por{" "}
          {formatearPesos(c.reembolso.importe)} ({etiquetaMedio(c.reembolso.medio_devolucion)})
        </p>
      )}

      <section className="seccion-comprobante">
        <h4>Paciente</h4>
        <dl className="resumen-turno">
          <dt>Nombre</dt>
          <dd>
            {c.paciente.apellido}, {c.paciente.nombre}
          </dd>
          <dt>DNI</dt>
          <dd>{c.paciente.dni}</dd>
        </dl>
      </section>

      <section className="seccion-comprobante">
        <h4>Turno</h4>
        <dl className="resumen-turno">
          <dt>Fecha</dt>
          <dd>{formatearFecha(c.turno.fecha)}</dd>
          <dt>Horario</dt>
          <dd>
            {c.turno.hora_inicio} a {c.turno.hora_fin}
          </dd>
          <dt>Profesional</dt>
          <dd>
            {c.turno.apellido_profesional}, {c.turno.nombre_profesional}
          </dd>
          <dt>Servicio</dt>
          <dd>{c.turno.nombre_servicio}</dd>
          <dt>Cobertura</dt>
          <dd>
            {c.cobertura}
            {c.numero_afiliado && ` · nº de afiliado ${c.numero_afiliado}`}
          </dd>
          <dt>Estado del turno</dt>
          <dd>
            <EstadoTurnoBadge estado={c.turno.estado} />
          </dd>
        </dl>
      </section>

      <section className="seccion-comprobante">
        <h4>Pago</h4>
        <dl className="resumen-turno">
          <dt>Importe base</dt>
          <dd>{formatearPesos(c.importe_base)}</dd>
          <dt>Descuento</dt>
          <dd>{formatearPesos(c.descuento)}</dd>
          <dt>Importe final</dt>
          <dd>
            <strong>{formatearPesos(c.importe_final)}</strong>
          </dd>
          <dt>Medio de pago</dt>
          <dd>{etiquetaMedio(c.medio_pago)}</dd>
          <dt>Estado de cobro</dt>
          <dd>
            <EstadoCobroBadge estado={c.estado_cobro} />
          </dd>
          <dt>Registró el cobro</dt>
          <dd>{c.registrado_por}</dd>
        </dl>
      </section>

      <footer className="pie-impresion">
        Constancia interna de cobro. No válida como factura. · KineSys
      </footer>
    </article>
  );
}
