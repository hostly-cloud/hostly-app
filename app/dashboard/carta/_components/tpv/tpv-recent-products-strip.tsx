"use client";

import { useRef } from "react";
import type { TpvRecentProductEntry } from "./tpv-recent-products";

type TpvRecentProductsStripProps = {
  items: readonly TpvRecentProductEntry[];
  productById: ReadonlyMap<string, { id: string; nombre: string }>;
  onTap: (productId: string) => void;
  onLongPress: (productId: string) => void;
};

export function TpvRecentProductsStrip({
  items,
  productById,
  onTap,
  onLongPress,
}: TpvRecentProductsStripProps) {
  if (items.length === 0) return null;

  return (
    <div className="hostly-tpv-recent-strip-wrap">
      <div className="hostly-tpv-recent-strip-label">Recientes</div>
      <div className="hostly-tpv-recent-strip" role="list">
        {items.map((entry) => {
          const live = productById.get(entry.productId);
          const label = live?.nombre?.trim() || entry.productName;
          return (
            <RecentProductChip
              key={entry.productId}
              productId={entry.productId}
              label={label}
              onTap={onTap}
              onLongPress={onLongPress}
            />
          );
        })}
      </div>
    </div>
  );
}

function RecentProductChip({
  productId,
  label,
  onTap,
  onLongPress,
}: {
  productId: string;
  label: string;
  onTap: (productId: string) => void;
  onLongPress: (productId: string) => void;
}) {
  const longPressTimerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <button
      type="button"
      role="listitem"
      className="hostly-tpv-recent-chip"
      title={label}
      onClick={() => onTap(productId)}
      onPointerDown={() => {
        clearTimer();
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          onLongPress(productId);
        }, 520);
      }}
      onPointerUp={clearTimer}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
    >
      {label}
    </button>
  );
}
