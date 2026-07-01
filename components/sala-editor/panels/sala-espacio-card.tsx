"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import { salaEspacioTypeIcon } from "@/lib/sala-editor/catalog/espacio-types";

export type SalaEspacioCardProps = {
  espacio: SalaEspacio;
  selected: boolean;
  elementCount: number;
  onSelect: () => void;
  onUpdateEspacio?: (patch: Partial<SalaEspacioDraft>) => void;
};

export function SalaEspacioCard({
  espacio,
  selected,
  elementCount,
  onSelect,
  onUpdateEspacio,
}: SalaEspacioCardProps) {
  const icon = salaEspacioTypeIcon(espacio.tipo);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected) return;
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const closeMenu = useCallback(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, []);

  const handleMenuToggle = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

  const handleToggleVisible = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onUpdateEspacio?.({ visible: !espacio.visible });
      closeMenu();
    },
    [closeMenu, espacio.visible, onUpdateEspacio],
  );

  const handleToggleActive = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onUpdateEspacio?.({ active: !espacio.active });
      closeMenu();
    },
    [closeMenu, espacio.active, onUpdateEspacio],
  );

  return (
    <div
      ref={rootRef}
      className={[
        "hostly-sala-editor-space-chip",
        selected ? "is-selected" : "",
        !espacio.active ? "is-inactive" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--espacio-accent": espacio.color } as CSSProperties}
    >
      <button
        type="button"
        onClick={onSelect}
        className="hostly-sala-editor-space-chip__main"
        title={espacio.name}
      >
        <span
          className="hostly-sala-editor-space-chip__icon"
          style={{ backgroundColor: `${espacio.color}28`, color: espacio.color }}
          aria-hidden
        >
          {icon}
        </span>
        {selected ? (
          <span className="hostly-sala-editor-space-chip__name">{espacio.name}</span>
        ) : null}
        <span className="hostly-sala-editor-space-chip__count">{elementCount}</span>
      </button>

      {onUpdateEspacio ? (
        <details
          ref={menuRef}
          className="hostly-sala-editor-space-chip__menu"
          onClick={handleMenuToggle}
        >
          <summary className="hostly-sala-editor-space-chip__menu-trigger" aria-label="Opciones">
            ⋮
          </summary>
          <div className="hostly-sala-editor-layer__menu-panel" role="menu">
            <button type="button" role="menuitem" className="hostly-sala-editor-layer__menu-item" onClick={handleToggleVisible}>
              {espacio.visible ? "Ocultar" : "Mostrar"}
            </button>
            <button type="button" role="menuitem" className="hostly-sala-editor-layer__menu-item" onClick={handleToggleActive}>
              {espacio.active ? "Desactivar" : "Activar"}
            </button>
          </div>
        </details>
      ) : null}
    </div>
  );
}
