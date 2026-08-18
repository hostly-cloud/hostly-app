"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import type { SalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import {
  computeEditorVisualLayout,
  type EditorVisualLayout,
} from "@/lib/sala-editor/canvas/editor-visual-scale";
import { computeCanvasFitScale } from "@/lib/sala-editor/canvas/canvas-viewport";

export type EditorVisualLayoutState = EditorVisualLayout & {
  /** Respaldo CSS solo si el frame aún no cabe tras el PPU visual. */
  fitScale: number;
};

const EMPTY_LAYOUT: EditorVisualLayoutState = {
  displayPixelsPerUnit: 72,
  logicalPixelsPerUnit: 100,
  stageWidth: 0,
  stageHeight: 0,
  frameWidth: 0,
  frameHeight: 0,
  fitScale: 1,
};

export function useEditorVisualLayout(
  viewportRef: RefObject<HTMLElement | null>,
  basePreview: SalaEspacioBase | null | undefined,
  enabled: boolean,
): EditorVisualLayoutState {
  const [layout, setLayout] = useState<EditorVisualLayoutState>(EMPTY_LAYOUT);

  useLayoutEffect(() => {
    if (!enabled || !basePreview) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateLayout = () => {
      const visualLayout = computeEditorVisualLayout(basePreview, {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });

      const fitScale = computeCanvasFitScale(
        viewport.clientWidth,
        viewport.clientHeight,
        visualLayout.frameWidth,
        visualLayout.frameHeight,
      );

      setLayout({
        ...visualLayout,
        fitScale,
      });
    };

    updateLayout();

    const observer = new ResizeObserver(updateLayout);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [basePreview, enabled, viewportRef]);

  return enabled && basePreview ? layout : EMPTY_LAYOUT;
}
