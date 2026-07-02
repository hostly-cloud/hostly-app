"use client";

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import {
  AVAILABLE_STRUCTURAL_TOOLBOX_ITEMS,
  UPCOMING_STRUCTURAL_TOOLBOX_ITEMS,
} from "@/lib/sala-editor/catalog/structural-toolbox";
import { SalaStructuralToolCard } from "@/components/sala-editor/panels/sala-structural-tool-card";

export type SalaEstructuraSidebarProps = {
  activeToolKind: SalaStructuralElementKind | null;
  onSelectTool: (kind: SalaStructuralElementKind) => void;
};

export function SalaEstructuraSidebar({
  activeToolKind,
  onSelectTool,
}: SalaEstructuraSidebarProps) {
  return (
    <div className="hostly-sala-editor-toolbox">
      <ul className="hostly-sala-editor-tool-chip-grid">
        {AVAILABLE_STRUCTURAL_TOOLBOX_ITEMS.map((item) => (
          <li key={item.kind}>
            <SalaStructuralToolCard
              item={item}
              selected={activeToolKind === item.kind}
              onSelect={() => onSelectTool(item.kind)}
            />
          </li>
        ))}
      </ul>

      {UPCOMING_STRUCTURAL_TOOLBOX_ITEMS.length > 0 ? (
        <>
          <p className="hostly-sala-editor-toolbox__section-label">Próximamente</p>
          <ul className="hostly-sala-editor-tool-chip-grid hostly-sala-editor-tool-chip-grid--upcoming">
            {UPCOMING_STRUCTURAL_TOOLBOX_ITEMS.map((item) => (
              <li key={item.kind}>
                <SalaStructuralToolCard
                  item={item}
                  selected={false}
                  onSelect={() => onSelectTool(item.kind)}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
