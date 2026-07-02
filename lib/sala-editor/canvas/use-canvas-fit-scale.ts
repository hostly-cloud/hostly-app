"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Escala un plano acotado para caber en el viewport del editor sin scroll de página.
 */
export function useCanvasFitScale(
  viewportRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  deps: readonly unknown[] = [],
): number {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!enabled) {
      setScale(1);
      return;
    }

    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const updateScale = () => {
      const viewportWidth = viewport.clientWidth;
      const viewportHeight = viewport.clientHeight;
      const contentWidth = content.offsetWidth;
      const contentHeight = content.offsetHeight;

      if (
        viewportWidth <= 0 ||
        viewportHeight <= 0 ||
        contentWidth <= 0 ||
        contentHeight <= 0
      ) {
        setScale(1);
        return;
      }

      const nextScale = Math.min(
        1,
        viewportWidth / contentWidth,
        viewportHeight / contentHeight,
      );
      setScale(Number(nextScale.toFixed(4)));
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    observer.observe(content);

    return () => observer.disconnect();
  }, [contentRef, enabled, viewportRef, ...deps]);

  return scale;
}
