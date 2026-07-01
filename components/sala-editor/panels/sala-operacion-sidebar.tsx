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
    <div className="hostly-sala-editor-toolbox">
      <div className="hostly-sala-editor-toolbox__head">
        <span className="hostly-sala-editor-toolbox__label">Elementos</span>
      </div>

      <ul className="hostly-sala-editor-tool-grid">
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
