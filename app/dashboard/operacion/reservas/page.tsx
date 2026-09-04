"use client";

import { useRouter } from "next/navigation";
import ReservasView from "@/components/reservas/reservas-view";
import { HostlyButton } from "@/components/ui/hostly";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

export default function OperacionReservasPage() {
  const router = useRouter();

  return (
    <OperacionModuleShell
      title="Reservas"
      showFilterBar={false}
      topBarEnd={
        <HostlyButton
          variant="secondary"
          size="compact"
          onClick={() => router.push("/dashboard/operacion/reservas/clientes")}
        >
          Clientes
        </HostlyButton>
      }
    >
      <ReservasView />
    </OperacionModuleShell>
  );
}
