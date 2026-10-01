import { redirect } from "next/navigation";
import { BarraGestion } from "@/components/BarraGestion";
import { obtenerUsuarioGestion } from "@/lib/auth";

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const usuario = await obtenerUsuarioGestion();
  if (!usuario) {
    redirect("/login");
  }

  return (
    <BarraGestion usuario={usuario}>
      {/* Landmark principal: los lectores de pantalla saltan directo al contenido. */}
      <main id="contenido">{children}</main>
    </BarraGestion>
  );
}
