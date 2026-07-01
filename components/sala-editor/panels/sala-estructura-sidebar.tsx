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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="hostly-sala-editor-sidebar-heading">
        <h3 className="hostly-sala-editor-sidebar-heading__title">Herramientas</h3>
      </div>

      <ul className="hostly-sala-editor-sidebar-list">
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
