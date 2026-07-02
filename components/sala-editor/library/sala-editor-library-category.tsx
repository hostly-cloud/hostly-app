"use client";

import type { ReactNode } from "react";
import type { SalaEditorLibraryCategory } from "@/lib/sala-editor/library/types";
import { countAvailableLibraryItems } from "@/lib/sala-editor/library/editor-library-catalog";

export type SalaEditorLibraryCategoryProps = {
  category: SalaEditorLibraryCategory;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function categoryMetaLabel(category: SalaEditorLibraryCategory): string {
  if (category.upcoming) return "Próximamente";
  const count = countAvailableLibraryItems(category);
  if (count === 0) return "Próximamente";
  return `${count} elemento${count === 1 ? "" : "s"}`;
}

export function SalaEditorLibraryCategorySection({
  category,
  expanded,
  onToggle,
  children,
}: SalaEditorLibraryCategoryProps) {
  const panelId = `sala-library-panel-${category.id}`;
  const meta = categoryMetaLabel(category);

  return (
    <section
      className={[
        "hostly-sala-library__category",
        expanded ? "is-expanded" : "",
        category.upcoming ? "is-upcoming" : "",
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
          <span className="hostly-sala-library__category-label">{category.label}</span>
          <span className="hostly-sala-library__category-meta">{meta}</span>
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
