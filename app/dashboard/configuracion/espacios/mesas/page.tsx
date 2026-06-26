"use client";

import { useState } from "react";
import ConfigMesasPage from "@/app/dashboard/config/mesas/page";
import RoomsAssistant from "./rooms-assistant";

export default function ConfigEspaciosMesasPage() {
  const [advancedEditorOpen, setAdvancedEditorOpen] = useState(false);

  if (!advancedEditorOpen) {
    return (
      <RoomsAssistant
        onOpenAdvancedEditor={() => setAdvancedEditorOpen(true)}
      />
    );
  }

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
