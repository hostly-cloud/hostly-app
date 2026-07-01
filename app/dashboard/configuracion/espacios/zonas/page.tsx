"use client";

import ZonasManagement from "@/components/zonas/zonas-management";

export default function ConfigEspaciosZonasPage() {
  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="min-h-0 flex-1">
        <ZonasManagement />
      </div>
    </div>
  );
}
