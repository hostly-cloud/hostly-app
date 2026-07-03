"use client";

import type { SalaEditorLibraryItem } from "@/lib/sala-editor/library/types";
import type { SurfaceMaterialKind } from "@/lib/sala-editor/surface/surface-object";
import { SalaEditorLibrary } from "@/components/sala-editor/library/sala-editor-library";

export type SalaTerrenoSidebarProps = {
  activeSurfaceMaterial: SurfaceMaterialKind | null;
  onSelectSurfaceMaterial: (material: SurfaceMaterialKind) => void;
};

export function SalaTerrenoSidebar({
  activeSurfaceMaterial,
  onSelectSurfaceMaterial,
}: SalaTerrenoSidebarProps) {
  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--library">
      <SalaEditorLibrary
        phase="terreno"
        selection={{ surfaceMaterial: activeSurfaceMaterial }}
        onSelectItem={(item: SalaEditorLibraryItem) => {
          if (item.surfaceMaterial) onSelectSurfaceMaterial(item.surfaceMaterial);
        }}
      />
    </div>
  );
}
