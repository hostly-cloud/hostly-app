"use client";

import { SalaEditorWorkspace } from "@/components/sala-editor/sala-editor-workspace";

const PREVIEW_RESTAURANT_ID = "preview-local";

export default function EditorSalaV2PreviewPage() {
  return (
    <div className="hostly-sala-editor-page">
      <SalaEditorWorkspace
        restaurantId={PREVIEW_RESTAURANT_ID}
        legacyEditorHref="/dashboard/configuracion/espacios/mesas"
      />
    </div>
  );
}
