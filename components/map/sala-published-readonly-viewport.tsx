"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { computeTpvMapCameraFit } from "@/lib/map/tpv-map-camera";
import { TPV_OPERATIONAL_FIT_PADDING_PX } from "@/lib/map/tpv-operational-map-visual";

/**
 * Encaixa el stage V2 published en el viewport (cámara estable por dims del plano).
 * No usa bounds de mesas.
 */
export function SalaPublishedReadonlyViewport({
  planWidth,
  planHeight,
  planId,
  children,
  className,
  style,
}: {
  planWidth: number;
  planHeight: number;
  planId: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [camera, setCamera] = useState({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const userAdjustedRef = useRef(false);
  const lastPlanKeyRef = useRef<string>("");

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const planKey = `${planId}::${planWidth}::${planHeight}`;
    if (lastPlanKeyRef.current !== planKey) {
      lastPlanKeyRef.current = planKey;
      userAdjustedRef.current = false;
    }

    const apply = () => {
      if (userAdjustedRef.current) return;
      const vw = root.clientWidth;
      const vh = root.clientHeight;
      if (vw < 32 || vh < 32) return;
      const fit = computeTpvMapCameraFit({
        planId,
        planSize: { width: planWidth, height: planHeight },
        viewportWidth: vw,
        viewportHeight: vh,
        paddingPx: TPV_OPERATIONAL_FIT_PADDING_PX,
        fitZoomMax: 2.4,
      });
      setCamera({
        scale: fit.camera.scale,
        translateX: fit.camera.translateX,
        translateY: fit.camera.translateY,
      });
    };

    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(root);
    return () => ro.disconnect();
  }, [planId, planWidth, planHeight]);

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${camera.translateX}px, ${camera.translateY}px) scale(${camera.scale})`,
          transformOrigin: "0 0",
          width: planWidth,
          height: planHeight,
        }}
      >
        {children}
      </div>
    </div>
  );
}
