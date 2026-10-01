'use client';

import { DIAS_SEMANA, type FranjaProfesional } from "@/lib/profesionales/horarios";

type Props = {
  nombre: string;
  apellido: string;
  servicios: string[];
  franjas: FranjaProfesional[];
};

export function DescargarHorarioPdfButton({ nombre, apellido, servicios, franjas }: Props) {
  const imprimir = () => {
    document.title = `Horario de atención - ${apellido}, ${nombre}`;
    window.print();
    setTimeout(() => {
      document.title = "KineSys";
    }, 1000);
  };

  const franjasOrdenadas = [...franjas].sort(
    (a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio)
  );

  return (
    <>
      <button type="button" className="boton-principal boton-inline no-imprimir" onClick={imprimir}>
        Descargar PDF
      </button>

      <section className="solo-impresion bloque-impresion">
        <h3>Horario de atención</h3>
        <p className="titulo-profesional">
          {apellido}, {nombre}
        </p>

        <div className="servicios-impresion">
          <h4>Servicios asociados</h4>
          {servicios.length === 0 ? (
            <p>No tiene servicios asociados.</p>
          ) : (
            <ul>
              {servicios.map((servicio) => (
                <li key={servicio}>{servicio}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="franjas-impresion">
          <h4>Franjas</h4>
          {franjasOrdenadas.length === 0 ? (
            <p>No hay horarios configurados para este profesional.</p>
          ) : (
            <table className="tabla tabla-impresion">
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                </tr>
              </thead>
              <tbody>
                {franjasOrdenadas.map((franja) => (
                  <tr key={franja.id_franja}>
                    <td>{DIAS_SEMANA[franja.dia_semana - 1]}</td>
                    <td>{franja.hora_inicio.slice(0, 5)}</td>
                    <td>{franja.hora_fin.slice(0, 5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
