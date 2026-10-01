import { notFound, redirect } from "next/navigation";
import { exigirGerente } from "@/lib/auth";
import { esIdUsuarioGestion } from "@/lib/usuarios-gestion/validar";

export default async function UsuarioGestionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirGerente();
  const { id } = await params;
  if (!esIdUsuarioGestion(id)) notFound();
  redirect(`/usuarios/${id}/editar`);
}
