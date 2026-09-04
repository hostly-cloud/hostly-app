"use client";

import Link from "next/link";
import EmpleadosDashboardPage from "@/app/dashboard/empleados/employees-page-content";

export default function ConfigEmpleadosPage() {
  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap justify-end gap-2 px-4 pt-3 sm:px-6">
        <Link
          href="/dashboard/empleados/fichajes"
          className="hostly-button-secondary hostly-button-compact"
        >
          Terminal de fichaje
        </Link>
        <Link
          href="/dashboard/empleados/operaciones"
          className="hostly-button-primary hostly-button-compact"
        >
          RRHH operativo
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <EmpleadosDashboardPage embedInConfig />
      </div>
    </div>
  );
}
