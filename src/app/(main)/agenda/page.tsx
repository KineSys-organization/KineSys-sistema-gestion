import { AgendaForm } from "@/components/agenda/AgendaForm";
import { exigirRecepcion } from "@/lib/auth";
import { listarProfesionalesParaAgenda } from "@/lib/agenda/actions";

export default async function AgendaPage() {
  await exigirRecepcion();
  const { data, error } = await listarProfesionalesParaAgenda();

  return (
    <section className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h2>Agenda</h2>
          <p className="texto-suave">
            Consultá los turnos de un profesional para una fecha.
          </p>
        </div>
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      <AgendaForm profesionales={data} />
    </section>
  );
}
