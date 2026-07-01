"use client";

import { useCallback, useRef, type MouseEvent } from "react";
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

  const statusLabel = !espacio.active
    ? "Inactivo"
    : espacio.visible
      ? "Visible"
      : "Oculto";

  return (
    <div
      className={[
        "hostly-sala-editor-layer",
        selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button type="button" onClick={onSelect} className="hostly-sala-editor-layer__main">
        <span
          className="hostly-sala-editor-layer__icon"
          style={{ backgroundColor: `${espacio.color}24`, color: espacio.color }}
          aria-hidden
        >
          {icon}
        </span>
        <span className="hostly-sala-editor-layer__body">
          <span className="hostly-sala-editor-layer__name">{espacio.name}</span>
          <span className="hostly-sala-editor-layer__meta">
            <span
              className={[
                "hostly-sala-editor-layer__status",
                !espacio.active ? "is-muted" : espacio.visible ? "is-on" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {statusLabel}
            </span>
            <span className="hostly-sala-editor-layer__count">{elementCount}</span>
          </span>
        </span>
      </button>

      {onUpdateEspacio ? (
        <details
          ref={menuRef}
          className="hostly-sala-editor-layer__menu"
          onClick={handleMenuToggle}
        >
          <summary className="hostly-sala-editor-layer__menu-trigger" aria-label="Opciones del espacio">
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
