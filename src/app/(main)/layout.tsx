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
    <div className="dashboard">
      <BarraGestion usuario={usuario} />
      {children}
    </div>
  );
}
