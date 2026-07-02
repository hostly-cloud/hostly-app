"use client";

import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import type { SalaEditorLibraryItem } from "@/lib/sala-editor/library/types";
import { SalaEditorLibrary } from "@/components/sala-editor/library/sala-editor-library";

export type SalaOperacionSidebarProps = {
  activeElementType: OperationalElementType | null;
  activeVisualVariant?: OperationalVisualVariant | null;
  onSelectElementType: (
    type: OperationalElementType,
    visualVariant?: OperationalVisualVariant,
  ) => void;
};

export function SalaOperacionSidebar({
  activeElementType,
  activeVisualVariant = null,
  onSelectElementType,
}: SalaOperacionSidebarProps) {
  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--library">
      <SalaEditorLibrary
        phase="operacion"
        selection={{
          operationalType: activeElementType,
          visualVariant: activeVisualVariant,
        }}
        onSelectItem={(item: SalaEditorLibraryItem) => {
          if (item.operationalType) {
            onSelectElementType(item.operationalType, item.visualVariant);
          }
        }}
      />
    </div>
  );
}
