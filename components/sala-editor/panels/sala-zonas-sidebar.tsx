"use client";

import type { ZoneType } from "@/lib/sala-editor/zones/zone";
import type { SalaEditorLibraryItem } from "@/lib/sala-editor/library/types";
import { SalaEditorLibrary } from "@/components/sala-editor/library/sala-editor-library";

export type SalaZonasSidebarProps = {
  activeZoneType: ZoneType | null;
  onSelectZoneType: (type: ZoneType) => void;
};

export function SalaZonasSidebar({
  activeZoneType,
  onSelectZoneType,
}: SalaZonasSidebarProps) {
  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--library">
      <SalaEditorLibrary
        phase="zonas"
        selection={{ zoneType: activeZoneType }}
        onSelectItem={(item: SalaEditorLibraryItem) => {
          if (item.zoneType) {
            onSelectZoneType(item.zoneType);
          }
        }}
      />
    </div>
  );
}
