"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { HostlyButton } from "@/components/ui/hostly";

export type TpvQuickActionItem = {
  id: string;
  label: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void;
};

type TpvQuickActionsMenuProps = {
  open: boolean;
  anchor: { x: number; y: number } | null;
  title?: string;
  subtitle?: string;
  actions: TpvQuickActionItem[];
  onClose: () => void;
};

export function TpvQuickActionsMenu({
  open,
  anchor,
  title,
  subtitle,
  actions,
  onClose,
}: TpvQuickActionsMenuProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !anchor || typeof document === "undefined") return null;

  const viewportGutter = 8;
  const panelWidth = Math.min(248, Math.max(196, window.innerWidth - viewportGutter * 2));
  const left = Math.max(
    viewportGutter,
    Math.min(
      anchor.x - panelWidth * 0.5,
      window.innerWidth - panelWidth - viewportGutter,
    ),
  );
  const top = Math.max(8, Math.min(anchor.y - 12, window.innerHeight - 280));

  return createPortal(
    <>
      <button
        type="button"
        className="hostly-tpv-quick-actions-backdrop"
        aria-label="Cerrar acciones rápidas"
        onClick={onClose}
      />
      <div
        className="hostly-tpv-quick-actions-menu"
        role="menu"
        aria-label="Acciones rápidas de línea"
        style={{ top, left, width: panelWidth }}
      >
        {title ? (
          <div className="hostly-tpv-quick-actions-menu-head">
            <div className="hostly-tpv-quick-actions-menu-kicker">Línea</div>
            <div className="hostly-tpv-quick-actions-menu-title">{title}</div>
            {subtitle ? (
              <div className="hostly-tpv-quick-actions-menu-sub">{subtitle}</div>
            ) : null}
          </div>
        ) : null}
        <div className="hostly-tpv-quick-actions-menu-list">
          {actions.map((action) => (
            <HostlyButton
              key={action.id}
              variant={action.tone === "danger" ? "destructive" : "ghost"}
              size="touch"
              role="menuitem"
              disabled={action.disabled}
              className={`hostly-tpv-quick-actions-menu-item${
                action.tone === "danger" ? " is-danger" : ""
              }`}
              onClick={() => {
                if (action.disabled) return;
                action.onSelect();
                onClose();
              }}
            >
              {action.label}
            </HostlyButton>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
