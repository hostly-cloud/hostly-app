"use client";

import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { SalaEditorLibraryItem } from "@/lib/sala-editor/library/types";
import { SalaEditorLibrary } from "@/components/sala-editor/library/sala-editor-library";

export type SalaOperacionSidebarProps = {
  activeElementType: OperationalElementType | null;
  onSelectElementType: (type: OperationalElementType) => void;
};

export function SalaOperacionSidebar({
  activeElementType,
  onSelectElementType,
}: SalaOperacionSidebarProps) {
  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--library">
      <SalaEditorLibrary
        phase="operacion"
        selection={{ operationalType: activeElementType }}
        onSelectItem={(item: SalaEditorLibraryItem) => {
          if (item.operationalType) onSelectElementType(item.operationalType);
        }}
      />
    </div>
  );
}
