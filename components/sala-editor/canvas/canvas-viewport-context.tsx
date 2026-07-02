"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
  type RefObject,
} from "react";
import type { SalaPoint } from "@/lib/sala-editor/geometry/wall-geometry";
import { clientToStagePoint } from "@/lib/sala-editor/canvas/canvas-viewport";

export type CanvasViewportContextValue = {
  scale: number;
  displayPixelsPerUnit: number;
  logicalPixelsPerUnit: number;
  coordinateScale: number;
  resolveStagePoint: (clientX: number, clientY: number) => SalaPoint | null;
};

const CanvasViewportContext = createContext<CanvasViewportContextValue | null>(
  null,
);

export function CanvasViewportProvider({
  stageRef,
  scale,
  displayPixelsPerUnit,
  logicalPixelsPerUnit,
  coordinateScale,
  children,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  scale: number;
  displayPixelsPerUnit: number;
  logicalPixelsPerUnit: number;
  coordinateScale: number;
  children: ReactNode;
}) {
  const resolveStagePoint = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage) return null;
      return clientToStagePoint(stage, clientX, clientY);
    },
    [stageRef],
  );

  return (
    <CanvasViewportContext.Provider
      value={{
        scale,
        displayPixelsPerUnit,
        logicalPixelsPerUnit,
        coordinateScale,
        resolveStagePoint,
      }}
    >
      {children}
    </CanvasViewportContext.Provider>
  );
}

export function useCanvasViewport(): CanvasViewportContextValue | null {
  return useContext(CanvasViewportContext);
}
