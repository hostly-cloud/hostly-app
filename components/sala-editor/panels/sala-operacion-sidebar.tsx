"use client";

import { SALA_OPERATIONAL_CATALOG } from "@/lib/sala-editor/catalog/operational-catalog";
import type { SalaOperationalElementKind } from "@/lib/sala-editor/types/elementos-operativos";

type PreviewOperationalItem = {
  id: string;
  label: string;
  description: string;
};

const PREVIEW_OPERATIONAL_KINDS: SalaOperationalElementKind[] = [
  "table",
  "high-table",
  "sofa",
  "sunbed",
  "balinese-bed",
  "stool",
  "custom",
];

const PREVIEW_OPERATIONAL_EXTRA: PreviewOperationalItem[] = [
  {
    id: "balinese-bed-vip",
    label: "Cama balinesa VIP",
    description: "Daybed premium o zona VIP exterior.",
  },
];

export function SalaOperacionSidebar() {
  const items: PreviewOperationalItem[] = [
    ...SALA_OPERATIONAL_CATALOG.filter((item) =>
      PREVIEW_OPERATIONAL_KINDS.includes(item.kind),
    ).map((item) => ({
      id: item.kind,
      label: item.label,
      description: item.description,
    })),
    ...PREVIEW_OPERATIONAL_EXTRA,
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">
          Elementos operativos
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Catálogo preview — sin colocación todavía.
        </p>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5"
          >
            <p className="text-sm font-extrabold text-slate-800">{item.label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              {item.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
