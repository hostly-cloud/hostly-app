"use client";

import ReservasView from "@/components/reservas/reservas-view";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

export default function OperacionReservasPage() {
  return (
    <OperacionModuleShell title="Reservas" showFilterBar>
      <ReservasView />
    </OperacionModuleShell>
  );
}
