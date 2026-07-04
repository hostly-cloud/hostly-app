"use client";

import type { LandscapeElementKind } from "@/lib/sala-editor/landscape/landscape-element";
import type { SalaEditorLibraryItem } from "@/lib/sala-editor/library/types";
import { SalaEditorLibrary } from "@/components/sala-editor/library/sala-editor-library";

export type SalaPaisajismoSidebarProps = {
  activeLandscapeKind: LandscapeElementKind | null;
  onSelectLandscapeKind: (kind: LandscapeElementKind) => void;
};

export function SalaPaisajismoSidebar({
  activeLandscapeKind,
  onSelectLandscapeKind,
}: SalaPaisajismoSidebarProps) {
  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--library">
      <SalaEditorLibrary
        phase="paisajismo"
        selection={{ landscapeKind: activeLandscapeKind }}
        onSelectItem={(item: SalaEditorLibraryItem) => {
          if (item.landscapeKind) {
            onSelectLandscapeKind(item.landscapeKind);
          }
        }}
      />
    </div>
  );
}
