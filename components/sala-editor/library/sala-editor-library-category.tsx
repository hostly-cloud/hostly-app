"use client";

import type { ReactNode } from "react";
import type { SalaEditorLibraryCategory } from "@/lib/sala-editor/library/types";
import { countAvailableLibraryItems } from "@/lib/sala-editor/library/editor-library-catalog";
import { isLibraryCategoryInteractive } from "@/lib/sala-editor/library/filter-library-catalog";

export type SalaEditorLibraryCategoryProps = {
  category: SalaEditorLibraryCategory;
  expanded: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function SalaEditorLibraryCategorySection({
  category,
  expanded,
  disabled = false,
  onToggle,
  children,
}: SalaEditorLibraryCategoryProps) {
  const panelId = `sala-library-panel-${category.id}`;
  const availableCount = countAvailableLibraryItems(category);
  const isInteractive = !disabled && isLibraryCategoryInteractive(category);

  if (!isInteractive) {
    return (
      <section className="hostly-sala-library__category is-empty is-disabled">
        <div className="hostly-sala-library__category-toggle hostly-sala-library__category-toggle--static">
          <span className="hostly-sala-library__category-chevron" aria-hidden>
            ▸
          </span>
          <span className="hostly-sala-library__category-icon" aria-hidden>
            {category.icon}
          </span>
          <span className="hostly-sala-library__category-copy">
            <span className="hostly-sala-library__category-label">
              {category.label}
              <span className="hostly-sala-library__category-count">
                {" "}
                · {availableCount}
              </span>
            </span>
            <span className="hostly-sala-library__category-meta">
              Disponible próximamente
            </span>
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      className={[
        "hostly-sala-library__category",
        expanded ? "is-expanded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="hostly-sala-library__category-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="hostly-sala-library__category-chevron" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
        <span className="hostly-sala-library__category-icon" aria-hidden>
          {category.icon}
        </span>
        <span className="hostly-sala-library__category-copy">
          <span className="hostly-sala-library__category-label">
            {category.label}
            <span className="hostly-sala-library__category-count">
              {" "}
              · {availableCount}
            </span>
          </span>
        </span>
      </button>

      <div
        id={panelId}
        className={[
          "hostly-sala-library__category-panel",
          expanded ? "is-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden={!expanded}
      >
        <div className="hostly-sala-library__category-panel-inner">{children}</div>
      </div>
    </section>
  );
}
