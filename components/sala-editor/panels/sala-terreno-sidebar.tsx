"use client";

import { useState } from "react";
import type { SalaEditorLibraryItem } from "@/lib/sala-editor/library/types";
import {
  SALA_SURFACE_SHAPE_EVENT,
  type SurfaceMaterialKind,
  type SurfaceShapeKind,
} from "@/lib/sala-editor/surface/surface-object";
import { SalaEditorLibrary } from "@/components/sala-editor/library/sala-editor-library";

export type SalaTerrenoSidebarProps = {
  activeSurfaceMaterial: SurfaceMaterialKind | null;
  onSelectSurfaceMaterial: (material: SurfaceMaterialKind) => void;
};

export function SalaTerrenoSidebar({ activeSurfaceMaterial, onSelectSurfaceMaterial }: SalaTerrenoSidebarProps) {
  const [surfaceShape, setSurfaceShape] = useState<SurfaceShapeKind>("rectangle");

  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--library">
      <SalaEditorLibrary
        phase="terreno"
        selection={{ surfaceMaterial: activeSurfaceMaterial, surfaceShape }}
        onSelectItem={(item: SalaEditorLibraryItem) => {
          if (item.surfaceShape) {
            setSurfaceShape(item.surfaceShape);
            window.dispatchEvent(new CustomEvent(SALA_SURFACE_SHAPE_EVENT, { detail: { shape: item.surfaceShape } }));
          }
          if (item.surfaceMaterial) onSelectSurfaceMaterial(item.surfaceMaterial);
        }}
      />
    </div>
  );
}
