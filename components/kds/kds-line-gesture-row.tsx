"use client";

import type { ReactNode } from "react";
import { useCallback, useRef } from "react";

type KdsLineGestureRowProps = {
  enabled?: boolean;
  onSwipePrepare?: () => void;
  onDoubleTapPrepare?: () => void;
  onLongPress?: (anchor: { x: number; y: number }) => void;
  children: ReactNode;
};

const SWIPE_THRESHOLD = 64;
const LONG_PRESS_MS = 520;
const DOUBLE_TAP_MS = 280;

export function KdsLineGestureRow({
  enabled = true,
  onSwipePrepare,
  onDoubleTapPrepare,
  onLongPress,
  children,
}: KdsLineGestureRowProps) {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTapRef = useRef(0);
  const longPressTimerRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  if (!enabled) return <>{children}</>;

  return (
    <div
      className="hostly-kds-line-gesture"
      onTouchStart={(event) => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        if (!touch) return;
        movedRef.current = false;
        startRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
        clearLongPress();
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          if (movedRef.current || !startRef.current) return;
          onLongPress?.({ x: startRef.current.x, y: startRef.current.y });
          startRef.current = null;
        }, LONG_PRESS_MS);
      }}
      onTouchMove={(event) => {
        const start = startRef.current;
        if (!start || event.touches.length !== 1) return;
        const touch = event.touches[0];
        if (!touch) return;
        const dx = Math.abs(touch.clientX - start.x);
        const dy = Math.abs(touch.clientY - start.y);
        if (dx > 8 || dy > 8) {
          movedRef.current = true;
          clearLongPress();
        }
      }}
      onTouchEnd={(event) => {
        clearLongPress();
        const start = startRef.current;
        startRef.current = null;
        if (!start || movedRef.current) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - start.x;
        if (dx >= SWIPE_THRESHOLD) {
          onSwipePrepare?.();
          return;
        }
        const now = Date.now();
        if (now - lastTapRef.current <= DOUBLE_TAP_MS) {
          lastTapRef.current = 0;
          onDoubleTapPrepare?.();
          return;
        }
        lastTapRef.current = now;
      }}
      onTouchCancel={clearLongPress}
    >
      {children}
    </div>
  );
}
