"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Compatibility shell kept temporarily so the large TPV consumer can be cleaned
 * mechanically in a later change without mixing that refactor with gesture logic.
 *
 * The Editor V2 viewport now owns pan, pinch, wheel zoom and table-join gesture
 * coordination. This component must not create DOM, capture pointers or apply a
 * second transform.
 */
export type PinchZoomMapProps = {
  enabled?: boolean;
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  containerStyle?: CSSProperties;
  className?: string;
  children: ReactNode;
};

export function PinchZoomMap({ children }: PinchZoomMapProps) {
  return <>{children}</>;
}
