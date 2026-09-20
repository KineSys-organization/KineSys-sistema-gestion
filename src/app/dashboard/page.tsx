import { redirect } from "next/navigation";

// Compatibilidad con la ruta vieja: el inicio ahora vive en (main) → "/"
export default function DashboardRedirectPage() {
  redirect("/");
}
