"use client";

import ReservationCustomerHistoryView from "@/components/reservas/reservation-customer-history-view";
import { OperacionModuleShell } from "../../_components/operacion-module-shell";

export default function ReservationCustomersPage() {
  return (
    <OperacionModuleShell title="Clientes de reservas" showFilterBar={false}>
      <ReservationCustomerHistoryView />
    </OperacionModuleShell>
  );
}
