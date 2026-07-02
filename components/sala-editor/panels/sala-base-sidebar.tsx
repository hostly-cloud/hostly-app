"use client";

import { SalaEditorLibrary } from "@/components/sala-editor/library/sala-editor-library";

export function SalaBaseSidebar() {
  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--library">
      <SalaEditorLibrary
        phase="base"
        selection={{}}
        onSelectItem={() => {
          /* Pass 1: arquitectura de biblioteca; herramientas Base pendientes. */
        }}
      />
    </div>
  );
}
