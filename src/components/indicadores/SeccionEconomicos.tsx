import type { IndicadoresEconomicos } from "@/lib/indicadores/tipos";
import { anchoBarra, describirVariacion, nombreMes } from "@/lib/indicadores/economicos";
import { formatearFechaCorta } from "@/lib/indicadores/validar";
import { etiquetaMedio, formatearPesos } from "@/lib/pagos/validar";
import { GraficoBarras } from "@/components/indicadores/GraficoBarras";

// HU-19. Sección "Económicos" de /indicadores (solo Gerente).
// Ingresos = pagos registrados en el período (por fecha del pago, hora AR); los reembolsos
// restan en el período en que se registran. Todos los números vienen calculados de la base.
export function SeccionEconomicos({ datos }: { datos: IndicadoresEconomicos }) {
  const { ingresos, evolucion, cobertura } = datos;
  const variacion = describirVariacion(
    Number(evolucion.variacion_pesos),
    evolucion.variacion_porcentaje === null ? null : Number(evolucion.variacion_porcentaje)
  );
  const maximoMes = Math.max(0, ...datos.meses.map((m) => Number(m.netos)));

  return (
    <section id="economicos" className="bloque" aria-labelledby="titulo-economicos">
      <div className="modulo-cabecera">
        <div>
          <h3 id="titulo-economicos">Económicos</h3>
          <p className="texto-suave">
            Pagos registrados del {formatearFechaCorta(datos.desde)} al{" "}
            {formatearFechaCorta(datos.hasta)} (por fecha del pago). No incluye importes estimados.
          </p>
        </div>
      </div>

      {/* Ingresos del período */}
      <div className="indicadores-grid-economicos bloque">
        <article className="tarjeta indicador indicador-destacado">
          <span className="indicador-titulo">Ingresos netos</span>
          <strong className="indicador-valor indicador-importe">{formatearPesos(ingresos.netos)}</strong>
          <span className="indicador-detalle">Brutos − reembolsos</span>
        </article>
        <article className="tarjeta indicador">
          <span className="indicador-titulo">Ingresos brutos</span>
          <strong className="indicador-valor indicador-importe">{formatearPesos(ingresos.brutos)}</strong>
          <span className="indicador-detalle">
            {ingresos.cantidad_pagos} {ingresos.cantidad_pagos === 1 ? "pago" : "pagos"} · promedio{" "}
            {formatearPesos(ingresos.promedio)}
          </span>
        </article>
        <article className="tarjeta indicador">
          <span className="indicador-titulo">Reembolsos</span>
          <strong className="indicador-valor indicador-importe">{formatearPesos(ingresos.reembolsos)}</strong>
          <span className="indicador-detalle">
            {ingresos.cantidad_reembolsos}{" "}
            {ingresos.cantidad_reembolsos === 1 ? "registrado" : "registrados"} en el período
          </span>
        </article>
        <article className="tarjeta indicador">
          <span className="indicador-titulo">Pendientes de cobro</span>
          <strong className="indicador-valor">{datos.pendientes_cobro}</strong>
          <span className="indicador-detalle">Turnos del período sin pago (no se estima importe)</span>
        </article>
      </div>

      {/* Evolución contra el período anterior de igual duración */}
      <article className={`tarjeta bloque evolucion-ingresos tendencia-${variacion.tendencia}`}>
        <span className="indicador-titulo">Evolución de los ingresos netos</span>
        <p>
          Período anterior ({formatearFechaCorta(datos.anterior.desde)} al{" "}
          {formatearFechaCorta(datos.anterior.hasta)}): {formatearPesos(evolucion.netos_anterior)}
        </p>
        {variacion.tendencia === "sin_datos" ? (
          <strong className="evolucion-valor">{variacion.porcentaje}</strong>
        ) : (
          <strong className="evolucion-valor">
            {variacion.tendencia === "sube" ? "▲ " : variacion.tendencia === "baja" ? "▼ " : ""}
            {Number(evolucion.variacion_pesos) > 0 ? "+" : ""}
            {formatearPesos(evolucion.variacion_pesos)} ({variacion.porcentaje})
          </strong>
        )}
      </article>

      {/* Por medio de pago y por cobertura */}
      <div className="grilla-economicos bloque">
        <section className="tarjeta">
          <h4>Por medio de pago</h4>
          <table className="tabla">
            <thead>
              <tr>
                <th>Medio</th>
                <th className="celda-numero">Pagos</th>
                <th className="celda-numero">Importe</th>
              </tr>
            </thead>
            <tbody>
              {datos.por_medio.map((m) => (
                <tr key={m.medio} className={Number(m.cantidad) === 0 ? "fila-en-cero" : undefined}>
                  <td>{etiquetaMedio(m.medio)}</td>
                  <td className="celda-numero">{m.cantidad}</td>
                  <td className="celda-numero">{formatearPesos(m.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <GraficoBarras
            titulo="Ingresos por medio de pago"
            barras={datos.por_medio.map((m) => ({
              clave: m.medio,
              etiqueta: etiquetaMedio(m.medio),
              importe: Number(m.importe),
              cantidad: Number(m.cantidad),
            }))}
          />
        </section>

        <section className="tarjeta">
          <h4>Particular y obra social</h4>
          <table className="tabla">
            <thead>
              <tr>
                <th>Cobertura del turno</th>
                <th className="celda-numero">Pagos</th>
                <th className="celda-numero">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Particular</td>
                <td className="celda-numero">{cobertura.particular_cantidad}</td>
                <td className="celda-numero">{formatearPesos(cobertura.particular_importe)}</td>
              </tr>
              <tr>
                <td>Obra social</td>
                <td className="celda-numero">{cobertura.obra_social_cantidad}</td>
                <td className="celda-numero">{formatearPesos(cobertura.obra_social_importe)}</td>
              </tr>
            </tbody>
          </table>
          <p className="texto-suave">
            Descuentos aplicados: <strong>{formatearPesos(cobertura.descuentos)}</strong>
          </p>
        </section>
      </div>

      {/* (Should) Últimos 6 meses, con barras en CSS */}
      <section className="tarjeta bloque">
        <h4>Ingresos netos de los últimos 6 meses</h4>
        <ul className="barras-meses">
          {datos.meses.map((m) => (
            <li key={m.mes}>
              <span className="barra-etiqueta">{nombreMes(m.mes)}</span>
              <span className="barra-pista" aria-hidden="true">
                <span className="barra-relleno" style={{ width: `${anchoBarra(Number(m.netos), maximoMes)}%` }} />
              </span>
              <span className="barra-valor">{formatearPesos(m.netos)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* (Should) Por servicio y por profesional del turno cobrado */}
      <div className="grilla-economicos bloque">
        <section className="tarjeta">
          <h4>Por servicio</h4>
          {datos.por_servicio.length === 0 ? (
            <p className="texto-suave">No hubo pagos en el período.</p>
          ) : (
            <>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th className="celda-numero">Pagos</th>
                  <th className="celda-numero">Importe</th>
                </tr>
              </thead>
              <tbody>
                {datos.por_servicio.map((s) => (
                  <tr key={s.id_servicio}>
                    <td>{s.nombre}</td>
                    <td className="celda-numero">{s.cantidad}</td>
                    <td className="celda-numero">{formatearPesos(s.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <GraficoBarras
              titulo="Ingresos por servicio"
              barras={datos.por_servicio.map((s) => ({
                clave: s.id_servicio,
                etiqueta: s.nombre,
                importe: Number(s.importe),
                cantidad: Number(s.cantidad),
              }))}
            />
            </>
          )}
        </section>

        <section className="tarjeta">
          <h4>Por profesional</h4>
          {datos.por_profesional.length === 0 ? (
            <p className="texto-suave">No hubo pagos en el período.</p>
          ) : (
            <>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Profesional</th>
                  <th className="celda-numero">Pagos</th>
                  <th className="celda-numero">Importe</th>
                </tr>
              </thead>
              <tbody>
                {datos.por_profesional.map((p) => (
                  <tr key={p.id_profesional}>
                    <td>
                      {p.apellido}, {p.nombre}
                    </td>
                    <td className="celda-numero">{p.cantidad}</td>
                    <td className="celda-numero">{formatearPesos(p.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <GraficoBarras
              titulo="Ingresos por profesional"
              barras={datos.por_profesional.map((p) => ({
                clave: p.id_profesional,
                etiqueta: `${p.apellido}, ${p.nombre}`,
                importe: Number(p.importe),
                cantidad: Number(p.cantidad),
              }))}
            />
            </>
          )}
        </section>
      </div>
    </section>
  );
}
