"use client";

import type { ReactNode } from "react";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="hostly-sala-editor-inspector__section">
      <h4 className="hostly-sala-editor-inspector__section-title">{title}</h4>
      {children}
    </section>
  );
}

function CapabilityRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-600">
      <span>{label}</span>
      <span
        className={[
          "rounded-full px-1.5 py-px text-[9px] font-extrabold uppercase",
          enabled
            ? "bg-[var(--hostly-accent-soft)] text-[var(--hostly-accent)]"
            : "bg-slate-100 text-slate-400",
        ].join(" ")}
      >
        {enabled ? "Sí" : "No"}
      </span>
    </li>
  );
}

export type SalaOperationalElementInspectorProps = {
  catalogItem: OperationalElementCatalogItem;
};

export function SalaOperationalElementInspector({
  catalogItem,
}: SalaOperationalElementInspectorProps) {
  return (
    <div className="hostly-sala-editor-inspector">
      <InspectorSection title="Tipo activo">
        <div className="hostly-sala-editor-inspector__card">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
              style={{ backgroundColor: `${catalogItem.color}22` }}
              aria-hidden
            >
              {catalogItem.icon}
            </span>
            <div>
              <p className="text-xs font-extrabold text-slate-900">{catalogItem.label}</p>
              <p className="text-[10px] text-slate-500">{catalogItem.description}</p>
            </div>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <dt className="font-bold text-slate-600">Capacidad</dt>
              <dd className="font-semibold text-slate-700">
                {catalogItem.defaultCapacity > 0
                  ? `${catalogItem.defaultCapacity} pax`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-600">Color</dt>
              <dd className="flex items-center gap-1 font-semibold text-slate-700">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-slate-200"
                  style={{ backgroundColor: catalogItem.color }}
                  aria-hidden
                />
              </dd>
            </div>
          </dl>
        </div>
      </InspectorSection>

      <InspectorSection title="Capacidades">
        <ul className="hostly-sala-editor-inspector__card space-y-1 bg-slate-50/70 py-2">
          <CapabilityRow label="Reservas" enabled={catalogItem.supportsReservations} />
          <CapabilityRow label="TPV" enabled={catalogItem.supportsTpv} />
          <CapabilityRow label="Limpieza" enabled={catalogItem.supportsCleaning} />
          <CapabilityRow label="Inventario" enabled={catalogItem.supportsInventory} />
        </ul>
      </InspectorSection>
    </div>
  );
}
