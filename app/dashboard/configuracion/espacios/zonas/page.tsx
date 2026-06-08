"use client";

import ZonasManagement from "@/components/zonas/zonas-management";
import { ConfigModulePageHeader } from "../../_components/config-module-page-header";

export default function ConfigEspaciosZonasPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-6 sm:px-6 lg:px-8">
      <ConfigModulePageHeader
        title="Zonas"
        description="Espacios · Zonas del local y asignación operativa."
      />
      <div className="min-h-0 flex-1">
        <ZonasManagement />
      </div>
    </div>
  );
}
