"use client";

import ReservasOperationalView from "@/components/reservas/reservas-operational-view";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

export default function OperacionReservasPage() {
  return (
    <OperacionModuleShell title="Reservas" showFilterBar={false}>
      <ReservasOperationalView />
    </OperacionModuleShell>
  );
}
