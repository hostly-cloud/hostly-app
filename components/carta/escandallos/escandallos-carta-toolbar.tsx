"use client";

import type { ReactNode } from "react";
import { hostlySegmentPillClassName } from "@/components/ui/hostly";
import type { MarginHealth } from "./escandallo-display-utils";

export type EscandalloToolbarTier = "all" | Exclude<MarginHealth, "none">;

const TIER_CHOICES: { id: EscandalloToolbarTier; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "excelente", label: "Excelente" },
  { id: "bueno", label: "Bueno" },
  { id: "ajustado", label: "Ajustado" },
  { id: "peligro", label: "Peligro" },
];

export type EscandallosCartaToolbarProps = {
  totalCount: number;
  search: string;
  tierFilter: EscandalloToolbarTier;
  onSearchChange: (value: string) => void;
  onTierChange: (tier: EscandalloToolbarTier) => void;
  bestSummary?: string | null;
  worstSummary?: string | null;
  trailing?: ReactNode;
};

export function EscandallosCartaToolbar({
  totalCount,
  search,
  tierFilter,
  onSearchChange,
  onTierChange,
  bestSummary,
  worstSummary,
  trailing,
}: EscandallosCartaToolbarProps) {
  return (
    <div className="hostly-recipe-editor__toolbar">
      <div className="hostly-recipe-editor__toolbar-meta">
        <span className="hostly-recipe-editor__toolbar-count">{totalCount} escandallos</span>
        {bestSummary ? (
          <span className="hostly-recipe-editor__toolbar-highlight hostly-recipe-editor__toolbar-highlight--up">
            {bestSummary}
          </span>
        ) : null}
        {worstSummary ? (
          <span className="hostly-recipe-editor__toolbar-highlight hostly-recipe-editor__toolbar-highlight--down">
            {worstSummary}
          </span>
        ) : null}
      </div>
      <div className="hostly-recipe-editor__toolbar-controls">
        <input
          type="search"
          className="hostly-input hostly-recipe-editor__search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar producto…"
          aria-label="Buscar producto"
        />
        <div className="hostly-recipe-editor__tier-filters">
          {TIER_CHOICES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={tierFilter === opt.id}
              className={hostlySegmentPillClassName()}
              onClick={() => onTierChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {trailing}
      </div>
    </div>
  );
}
