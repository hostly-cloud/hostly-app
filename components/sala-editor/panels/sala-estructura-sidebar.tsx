"use client";

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import { STRUCTURAL_TOOLBOX_ITEMS } from "@/lib/sala-editor/catalog/structural-toolbox";
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
      <div className="hostly-sala-editor-toolbox__head">
        <span className="hostly-sala-editor-toolbox__label">Herramientas</span>
      </div>

      <ul className="hostly-sala-editor-tool-grid">
        {STRUCTURAL_TOOLBOX_ITEMS.map((item) => (
          <li key={item.kind}>
            <SalaStructuralToolCard
              item={item}
              selected={activeToolKind === item.kind}
              onSelect={() => onSelectTool(item.kind)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
