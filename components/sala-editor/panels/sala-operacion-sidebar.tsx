"use client";

import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import { OPERATIONAL_ELEMENT_CATALOG } from "@/lib/sala-editor/ose/operational-element-catalog";
import { SalaOperationalElementCard } from "@/components/sala-editor/panels/sala-operational-element-card";

export type SalaOperacionSidebarProps = {
  activeElementType: OperationalElementType | null;
  onSelectElementType: (type: OperationalElementType) => void;
};

export function SalaOperacionSidebar({
  activeElementType,
  onSelectElementType,
}: SalaOperacionSidebarProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Elementos</h3>
        <p className="mt-1 text-xs text-slate-500">
          Selecciona un tipo operativo activo.
        </p>
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
        {OPERATIONAL_ELEMENT_CATALOG.map((item) => (
          <li key={item.type}>
            <SalaOperationalElementCard
              item={item}
              selected={activeElementType === item.type}
              onSelect={() => onSelectElementType(item.type)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
