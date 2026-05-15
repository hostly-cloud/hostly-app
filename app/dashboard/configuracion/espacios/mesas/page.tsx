"use client";

import ConfigMesasPage from "@/app/dashboard/config/mesas/page";

export default function ConfigEspaciosMesasPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ConfigMesasPage
        lockViewportFillParent
        premiumSpatialEditor
        configuracionMapEditorLayout
      />
    </div>
  );
}
