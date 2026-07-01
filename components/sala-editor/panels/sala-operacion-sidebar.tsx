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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="hostly-sala-editor-sidebar-heading">
        <h3 className="hostly-sala-editor-sidebar-heading__title">Elementos</h3>
      </div>

      <ul className="hostly-sala-editor-sidebar-list">
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
