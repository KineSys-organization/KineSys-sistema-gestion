import { bloqueosEnFecha, textoBloqueo, type BloqueoVista } from "@/lib/bloqueos/validar";

// HU-33. El día o el horario bloqueado, con su motivo, en la agenda.
export function AvisoBloqueos({
  fecha,
  bloqueos,
}: {
  fecha: string;
  bloqueos: BloqueoVista[];
}) {
  const delDia = bloqueosEnFecha(fecha, bloqueos);
  if (delDia.length === 0) return null;

  return (
    <div className="aviso-accion" role="status">
      {delDia.map((bloqueo) => (
        <p key={bloqueo.id_bloqueo}>{textoBloqueo(bloqueo)}</p>
      ))}
    </div>
  );
}
