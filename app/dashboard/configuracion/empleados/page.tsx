"use client";

import EmpleadosDashboardPage from "@/app/dashboard/empleados/page";

export default function ConfigEmpleadosPage() {
  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col overflow-auto">
      <EmpleadosDashboardPage embedInConfig />
    </div>
  );
}
