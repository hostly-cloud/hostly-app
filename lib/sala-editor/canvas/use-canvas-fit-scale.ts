"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { computeCanvasFitScale } from "@/lib/sala-editor/canvas/canvas-viewport";

/**
 * Calcula escala de ajuste cuando el plano acotado no cabe en el viewport.
 * No escala por encima de 1 (tamaño operativo normal).
 */
export function useCanvasFitScale(
  viewportRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): number {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!enabled) return;

    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const updateScale = () => {
      setScale(
        computeCanvasFitScale(
          viewport.clientWidth,
          viewport.clientHeight,
          content.offsetWidth,
          content.offsetHeight,
        ),
      );
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    observer.observe(content);

    return () => observer.disconnect();
  }, [contentRef, enabled, viewportRef]);

  return enabled ? scale : 1;
}
