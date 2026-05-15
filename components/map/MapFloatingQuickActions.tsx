"use client";

import type { CSSProperties } from "react";
import {
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  ArrowDown,
  ArrowUp,
  Copy,
  Lock,
  Trash2,
} from "lucide-react";

export type ScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const iconProps = {
  size: 14,
  strokeWidth: 1.7,
  className: "text-slate-600",
} as const;

type MapFloatingQuickActionsProps = {
  anchor: ScreenRect | null;
  visible: boolean;
  multi: boolean;
  canDistribute: boolean;
  canReorderFront: boolean;
  canReorderBack: boolean;
  onDuplicate: () => void;
  onLock: () => void;
  onFront: () => void;
  onBack: () => void;
  onDelete: () => void;
  onAlignH: () => void;
  onAlignV: () => void;
  onDistributeH: () => void;
  onDistributeV: () => void;
};

const wrap: CSSProperties = {
  position: "fixed",
  zIndex: 60,
  pointerEvents: "none",
  maxWidth: "calc(100vw - 16px)",
};

const bar: CSSProperties = {
  pointerEvents: "auto",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 3,
  padding: "4px 5px",
  borderRadius: 999,
  border: "1px solid rgba(226, 232, 240, 0.78)",
  background: "rgba(255, 255, 255, 0.86)",
  boxShadow:
    "0 3px 12px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.05)",
  transition:
    "opacity 160ms ease, transform 160ms ease, visibility 160ms ease",
};

const btnBase: CSSProperties = {
  minHeight: 30,
  minWidth: 30,
  padding: 0,
  borderRadius: 999,
  border: "1px solid rgba(226, 232, 240, 0.8)",
  background: "rgba(248, 250, 252, 0.78)",
  cursor: "pointer",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background-color 140ms ease, border-color 140ms ease, opacity 140ms ease",
};

const btnDanger: CSSProperties = {
  ...btnBase,
  borderColor: "#fecdd3",
  background: "#fff1f2",
};

export default function MapFloatingQuickActions({
  anchor,
  visible,
  multi,
  canDistribute,
  canReorderFront,
  canReorderBack,
  onDuplicate,
  onLock,
  onFront,
  onBack,
  onDelete,
  onAlignH,
  onAlignV,
  onDistributeH,
  onDistributeV,
}: MapFloatingQuickActionsProps) {
  if (!visible || !anchor) return null;

  const barH = multi ? 72 : 38;
  const barW = multi ? 282 : 176;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const spaceRight = viewportW - (anchor.left + anchor.width);
  const preferRight = spaceRight >= barW + 18;
  const rawLeft = preferRight
    ? anchor.left + anchor.width + 12
    : anchor.left - barW - 12;
  const left = Math.max(8, Math.min(rawLeft, viewportW - barW - 8));
  const top = Math.max(
    8,
    Math.min(anchor.top + anchor.height / 2 - barH / 2, viewportH - barH - 8),
  );

  return (
    <div style={{ ...wrap, left, top }} role="toolbar" aria-label="Acciones rápidas">
      <div style={bar}>
        <button type="button" style={btnBase} title="Duplicar" onClick={onDuplicate}>
          <Copy {...iconProps} />
        </button>
        <button type="button" style={btnBase} title="Bloquear / desbloquear" onClick={onLock}>
          <Lock {...iconProps} />
        </button>
        <button
          type="button"
          style={{ ...btnBase, opacity: canReorderFront ? 1 : 0.38 }}
          title="Traer delante"
          disabled={!canReorderFront}
          onClick={onFront}
        >
          <ArrowUp {...iconProps} />
        </button>
        <button
          type="button"
          style={{ ...btnBase, opacity: canReorderBack ? 1 : 0.38 }}
          title="Enviar detrás"
          disabled={!canReorderBack}
          onClick={onBack}
        >
          <ArrowDown {...iconProps} />
        </button>
        {multi ? (
          <>
            <span
              style={{
                width: 1,
                height: 18,
                background: "rgba(226, 232, 240, 0.9)",
                margin: "0 2px",
                flexShrink: 0,
              }}
              aria-hidden
            />
            <button type="button" style={btnBase} title="Alinear horizontal" onClick={onAlignH}>
              <AlignHorizontalSpaceAround {...iconProps} />
            </button>
            <button type="button" style={btnBase} title="Alinear vertical" onClick={onAlignV}>
              <AlignVerticalSpaceAround {...iconProps} />
            </button>
            <button
              type="button"
              style={{ ...btnBase, opacity: canDistribute ? 1 : 0.38 }}
              title="Distribuir horizontal"
              disabled={!canDistribute}
              onClick={onDistributeH}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: "#475569" }}>H</span>
            </button>
            <button
              type="button"
              style={{ ...btnBase, opacity: canDistribute ? 1 : 0.38 }}
              title="Distribuir vertical"
              disabled={!canDistribute}
              onClick={onDistributeV}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: "#475569" }}>V</span>
            </button>
          </>
        ) : null}
        <button type="button" style={btnDanger} title="Eliminar" onClick={onDelete}>
          <Trash2 {...iconProps} className="text-rose-600" strokeWidth={1.7} size={14} />
        </button>
      </div>
    </div>
  );
}
