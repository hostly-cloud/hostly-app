"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TranslateFn } from "@/lib/i18n";

export type ConfigCartaListFilterId =
  | "activos"
  | "inactivos"
  | "todos"
  | "enCarta"
  | "fueraCarta";

export type ConfigCartaStatusFilterCounts = {
  activos: number;
  inactivos: number;
  total: number;
  enCarta: number;
  fueraCarta: number;
};

type ConfigCartaStatusFilterSelectProps = {
  value: string;
  counts: ConfigCartaStatusFilterCounts;
  onChange: (id: ConfigCartaListFilterId) => void;
  t: TranslateFn;
};

const STATUS_FILTER_IDS: ConfigCartaListFilterId[] = [
  "activos",
  "inactivos",
  "todos",
  "enCarta",
  "fueraCarta",
];

export function isConfigCartaStatusListFilter(
  value: string,
): value is ConfigCartaListFilterId {
  return STATUS_FILTER_IDS.includes(value as ConfigCartaListFilterId);
}

export function ConfigCartaStatusFilterSelect({
  value,
  counts,
  onChange,
  t,
}: ConfigCartaStatusFilterSelectProps) {
  const selectValue = isConfigCartaStatusListFilter(value) ? value : "todos";

  return (
    <label className="hostly-productos-carta-status-filter">
      <span className="hostly-productos-carta-status-filter__prefix" aria-hidden>
        Estado
      </span>
      <select
        className="hostly-select hostly-select--toolbar-compact hostly-productos-carta-status-filter__select"
        value={selectValue}
        onChange={(e) => onChange(e.target.value as ConfigCartaListFilterId)}
        aria-label="Filtrar por estado del producto y publicación en carta"
      >
        <optgroup label="Estado">
          <option value="activos">{`Activos (${counts.activos})`}</option>
          <option value="inactivos">{`Inactivos (${counts.inactivos})`}</option>
          <option value="todos">{`Todos (${counts.total})`}</option>
        </optgroup>
        <optgroup label="Publicación en carta">
          <option value="enCarta">{`${t("productos.pubEnCarta")} (${counts.enCarta})`}</option>
          <option value="fueraCarta">{`${t("productos.pubFueraCarta")} (${counts.fueraCarta})`}</option>
        </optgroup>
      </select>
    </label>
  );
}

export type BulkMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledTitle?: string;
  tone?: "danger";
};

type ProductosCompactBulkActionsMenuProps = {
  items: BulkMenuItem[];
};

export function ProductosCompactBulkActionsMenu({
  items,
}: ProductosCompactBulkActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="hostly-productos-bulk-actions-menu">
      <button
        type="button"
        className="hostly-button-secondary hostly-button-compact hostly-productos-bulk-actions-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Acciones
        <span className="hostly-productos-bulk-actions-menu__caret" aria-hidden>
          ▼
        </span>
      </button>
      {open ? (
        <div className="hostly-productos-bulk-actions-menu__panel" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`hostly-productos-bulk-actions-menu__item${
                item.tone === "danger" ? " hostly-productos-bulk-actions-menu__item--danger" : ""
              }`}
              disabled={item.disabled}
              title={item.disabled ? item.disabledTitle : undefined}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ConfigCartaCompactFilterRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["hostly-productos-carta-compact-filters", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
