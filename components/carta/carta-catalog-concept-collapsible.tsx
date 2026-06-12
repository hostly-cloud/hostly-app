"use client";

import { useId, useState, type ReactNode } from "react";
import { ConfigCard } from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import {
  CartaCatalogHierarchyHelp,
  type CartaCatalogHierarchyFocus,
} from "@/components/carta/carta-catalog-hierarchy-help";

export type CartaCatalogConceptCollapsibleProps = {
  focus: CartaCatalogHierarchyFocus;
  /** Subtítulo de pantalla (antes visible bajo el título). */
  description: string;
  children: ReactNode;
};

/**
 * Bloque educativo colapsable para Familias de menú / Categorías de carta.
 * Cerrado por defecto para priorizar la lista operativa en móvil.
 */
export function CartaCatalogConceptCollapsible({
  focus,
  description,
  children,
}: CartaCatalogConceptCollapsibleProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="hostly-carta-concept-collapsible">
      <button
        type="button"
        className="hostly-carta-concept-collapsible__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="hostly-carta-concept-collapsible__trigger-label">
          <span className="hostly-carta-concept-collapsible__icon" aria-hidden>
            ℹ
          </span>
          Cómo funciona
        </span>
        <span className="hostly-carta-concept-collapsible__chevron" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <ConfigCard
          compact
          className="hostly-carta-config-card--muted hostly-carta-familia-concept hostly-carta-concept-collapsible__panel"
        >
          <div id={panelId} className="hostly-carta-concept-collapsible__panel-inner">
            <p className="hostly-carta-config-section-body hostly-carta-concept-collapsible__description">
              {description}
            </p>
            {children}
            <CartaCatalogHierarchyHelp focus={focus} />
          </div>
        </ConfigCard>
      ) : null}
    </div>
  );
}
