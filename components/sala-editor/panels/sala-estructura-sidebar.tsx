"use client";

import { SALA_STRUCTURAL_CATALOG } from "@/lib/sala-editor/catalog/structural-catalog";
import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";

const PREVIEW_STRUCTURAL_KINDS: SalaStructuralElementKind[] = [
  "wall",
  "glass",
  "door",
  "bar",
  "stage",
  "planter",
];

export function SalaEstructuraSidebar() {
  const items = SALA_STRUCTURAL_CATALOG.filter((item) =>
    PREVIEW_STRUCTURAL_KINDS.includes(item.kind),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">
          Elementos estructurales
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Catálogo preview — sin colocación todavía.
        </p>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
        {items.map((item) => (
          <li
            key={item.kind}
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
