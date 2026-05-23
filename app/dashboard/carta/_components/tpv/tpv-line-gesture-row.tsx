"use client";

import type { ReactNode } from "react";
import { useCallback, useRef } from "react";

type TpvLineGestureRowProps = {
  lineId: string;
  enabled?: boolean;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onLongPress?: (anchor: { x: number; y: number }) => void;
  children: ReactNode;
  className?: string;
};

const SWIPE_THRESHOLD_PX = 72;
const LONG_PRESS_MS = 480;
const MOVE_CANCEL_PX = 10;

export function TpvLineGestureRow({
  lineId,
  enabled = true,
  onSwipeLeft,
  onSwipeRight,
  onLongPress,
  children,
  className,
}: TpvLineGestureRowProps) {
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const swipeOffsetRef = useRef(0);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const resetSwipeVisual = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.style.transform = "";
    el.style.transition = "";
    swipeOffsetRef.current = 0;
  }, []);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={`hostly-tpv-line-gesture${className ? ` ${className}` : ""}`}
      data-line-id={lineId}
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        if (!touch) return;
        movedRef.current = false;
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          t: Date.now(),
        };
        clearLongPress();
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          if (movedRef.current || !touchStartRef.current) return;
          onLongPress?.({
            x: touchStartRef.current.x,
            y: touchStartRef.current.y,
          });
          touchStartRef.current = null;
        }, LONG_PRESS_MS);
      }}
      onTouchMove={(e) => {
        const start = touchStartRef.current;
        if (!start || e.touches.length !== 1) return;
        const touch = e.touches[0];
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) {
          movedRef.current = true;
          clearLongPress();
        }
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          const el = e.currentTarget as HTMLElement;
          const clamped = Math.max(-96, Math.min(96, dx));
          swipeOffsetRef.current = clamped;
          el.style.transition = "transform 80ms ease-out";
          el.style.transform = `translateX(${clamped}px)`;
        }
      }}
      onTouchEnd={(e) => {
        clearLongPress();
        const start = touchStartRef.current;
        touchStartRef.current = null;
        const el = e.currentTarget as HTMLElement;
        const offset = swipeOffsetRef.current;
        resetSwipeVisual(el);

        if (!start) return;
        if (Math.abs(offset) < SWIPE_THRESHOLD_PX) return;

        if (offset <= -SWIPE_THRESHOLD_PX) {
          onSwipeLeft?.();
          return;
        }
        if (offset >= SWIPE_THRESHOLD_PX) {
          onSwipeRight?.();
        }
      }}
      onTouchCancel={() => {
        clearLongPress();
        touchStartRef.current = null;
        movedRef.current = false;
      }}
    >
      {children}
    </div>
  );
}
