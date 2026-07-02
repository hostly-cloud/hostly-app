"use client";

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { SalaEditorLibraryItem } from "@/lib/sala-editor/library/types";
import { SalaEditorLibrary } from "@/components/sala-editor/library/sala-editor-library";

export type SalaEstructuraSidebarProps = {
  activeToolKind: SalaStructuralElementKind | null;
  onSelectTool: (kind: SalaStructuralElementKind) => void;
};

export function SalaEstructuraSidebar({
  activeToolKind,
  onSelectTool,
}: SalaEstructuraSidebarProps) {
  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--library">
      <SalaEditorLibrary
        phase="estructura"
        selection={{ structuralKind: activeToolKind }}
        onSelectItem={(item: SalaEditorLibraryItem) => {
          if (item.structuralKind) onSelectTool(item.structuralKind);
        }}
      />
    </div>
  );
}
