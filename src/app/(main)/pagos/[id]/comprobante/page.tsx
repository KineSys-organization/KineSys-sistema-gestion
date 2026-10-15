import Link from "next/link";
import { exigirRecepcion } from "@/lib/auth";
import { obtenerComprobante } from "@/lib/pagos/actions";
import { tituloComprobante } from "@/lib/pagos/validar";
import { ComprobantePago } from "@/components/pagos/ComprobantePago";
import { DescargarComprobanteButton } from "@/components/pagos/DescargarComprobanteButton";

type Props = {
  params: Promise<{ id: string }>; // id del pago
  searchParams: Promise<{ imprimir?: string }>;
};

// HU-35. Comprobante de un pago, listo para ver o reimprimir ("Descargar PDF").
// Solo Recepción y Gerente. Sin pago no hay comprobante (la base lo rechaza).
export default async function ComprobantePage({ params, searchParams }: Props) {
  await exigirRecepcion();
  const { id } = await params;
  const { imprimir } = await searchParams;
  const { data: comprobante, error } = await obtenerComprobante(id);

  if (error || !comprobante) {
    return (
      <section className="modulo">
        <h2>Comprobante de pago</h2>
        <p className="mensaje-error" role="alert">
          {error ?? "El comprobante no existe"}
        </p>
        <Link href="/pagos">Volver a pagos</Link>
      </section>
    );
  }

  return (
    <section className="modulo modulo-angosto">
      <div className="modulo-cabecera">
        <div>
          <h2>Comprobante de pago</h2>
          <p className="texto-suave">Constancia interna de cobro para entregarle al paciente.</p>
        </div>
        <div className="fila-acciones">
          <DescargarComprobanteButton
            titulo={tituloComprobante(
              comprobante.numero_comprobante,
              comprobante.paciente.apellido,
              comprobante.paciente.nombre
            )}
            autoImprimir={imprimir === "1"}
          />
          <Link
            className="boton-secundario boton-inline no-imprimir"
            href={`/turnos/${comprobante.id_turno}/pago`}
          >
            Ver el pago
          </Link>
          <Link className="boton-secundario boton-inline no-imprimir" href="/pagos">
            Volver a pagos
          </Link>
        </div>
      </div>

      <div className="tarjeta">
        <ComprobantePago comprobante={comprobante} />
      </div>
    </section>
  );
}
