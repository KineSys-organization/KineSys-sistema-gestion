"use client";

import { useFormStatus } from "react-dom";
import { logout } from "@/app/(auth)/logout/actions";

function LogoutSubmitButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Cerrando..." : "Cerrar sesión"}
    </button>
  );
}

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <LogoutSubmitButton className={className} />
    </form>
  );
}
