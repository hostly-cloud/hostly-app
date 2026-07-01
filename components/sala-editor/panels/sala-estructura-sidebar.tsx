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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Herramientas</h3>
        <p className="mt-1 text-xs text-slate-500">
          Selecciona una herramienta activa.
        </p>
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
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
