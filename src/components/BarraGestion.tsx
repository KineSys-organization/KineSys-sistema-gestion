import { LogoutButton } from "@/components/LogoutButton";

export function BarraGestion() {
  return (
    <header className="dashboard-barra">
      <div className="dashboard-marca">
        <img src="/logo-kinesys.svg" alt="" />
        <span>KineSys</span>
      </div>
      <LogoutButton className="boton-salida" />
    </header>
  );
}
