import Link from "next/link";
import { exigirGerente } from "@/lib/auth";
import { UsuarioGestionForm } from "@/components/usuarios-gestion/UsuarioGestionForm";

export default async function NuevoUsuarioGestionPage() {
  await exigirGerente();

  return (
    <section className="modulo modulo-angosto">
      <p>
        <Link href="/usuarios">← Volver al listado</Link>
      </p>
      <h2>Registrar usuario</h2>
      <p className="texto-suave">
        Se crea la cuenta de Gerente o Mesa de Entradas. No da de alta profesionales.
      </p>
      <div className="tarjeta">
        <UsuarioGestionForm />
      </div>
    </section>
  );
}
