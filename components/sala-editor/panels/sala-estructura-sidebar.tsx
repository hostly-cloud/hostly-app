"use client";

import { useState } from "react";
import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { SalaEditorLibraryItem } from "@/lib/sala-editor/library/types";
import { SalaEditorLibrary } from "@/components/sala-editor/library/sala-editor-library";
import {
  SALA_WALL_PRESET_EVENT,
  type SalaWallPreset,
} from "@/lib/sala-editor/walls/wall-presets";

export type SalaEstructuraSidebarProps = {
  activeToolKind: SalaStructuralElementKind | null;
  onSelectTool: (kind: SalaStructuralElementKind) => void;
};

export function SalaEstructuraSidebar({ activeToolKind, onSelectTool }: SalaEstructuraSidebarProps) {
  const [wallPreset, setWallPreset] = useState<SalaWallPreset>("free");

  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--library">
      <SalaEditorLibrary
        phase="estructura"
        selection={{ structuralKind: activeToolKind, wallPreset: activeToolKind === "wall" ? wallPreset : null }}
        onSelectItem={(item: SalaEditorLibraryItem) => {
          if (!item.structuralKind) return;
          if (item.structuralKind === "wall") {
            const nextPreset = item.wallPreset ?? "free";
            setWallPreset(nextPreset);
            window.dispatchEvent(new CustomEvent(SALA_WALL_PRESET_EVENT, { detail: { preset: nextPreset } }));
          }
          onSelectTool(item.structuralKind);
        }}
      />
    </div>
  );
}
