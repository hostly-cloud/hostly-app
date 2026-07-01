"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";

export type SalaOperacionWorkspaceProps = {
  espacio: SalaEspacio;
  catalogItem: OperationalElementCatalogItem;
};

export function SalaOperacionWorkspace({
  espacio,
  catalogItem,
}: SalaOperacionWorkspaceProps) {
  return (
    <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_55%,#eef2f7_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
      <div className="border-b border-slate-200/70 bg-white/85 px-4 py-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
          Elemento activo
        </p>
        <div className="mt-1 flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
            style={{ backgroundColor: `${catalogItem.color}22` }}
            aria-hidden
          >
            {catalogItem.icon}
          </span>
          <div>
            <p className="text-base font-extrabold text-slate-900">{catalogItem.label}</p>
            <p className="text-[11px] font-semibold text-slate-500">{espacio.name}</p>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className="pointer-events-none absolute inset-6 rounded-2xl opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />

        <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <p className="max-w-md text-lg font-extrabold leading-snug text-slate-800">
            {catalogItem.workspaceHint}
          </p>
          <p className="mt-3 text-sm text-slate-500">
            La colocación estará disponible en la siguiente iteración.
          </p>
        </div>
      </div>
    </div>
  );
}
