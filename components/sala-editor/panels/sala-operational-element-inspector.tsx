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
    <section className="space-y-3">
      <h4 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </h4>
      {children}
    </section>
  );
}

function InspectorDivider() {
  return <div className="h-px bg-slate-200/80" aria-hidden />;
}

function CapabilityRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
      <span>{label}</span>
      <span
        className={[
          "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-0.5">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
        <p className="mt-1 text-xs text-slate-500">Elemento activo · catálogo</p>
      </div>

      <InspectorSection title="Operación">
        <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
              style={{ backgroundColor: `${catalogItem.color}22` }}
              aria-hidden
            >
              {catalogItem.icon}
            </span>
            <div>
              <p className="text-xs font-bold text-slate-500">Tipo</p>
              <p className="text-sm font-extrabold text-slate-900">{catalogItem.label}</p>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            <span className="font-bold text-slate-700">Descripción</span>
            <br />
            {catalogItem.description}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="font-bold text-slate-700">Capacidad por defecto</dt>
              <dd className="mt-0.5 font-semibold text-slate-600">
                {catalogItem.defaultCapacity > 0
                  ? `${catalogItem.defaultCapacity} personas`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-700">Color</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-slate-600">
                <span
                  className="inline-block h-3 w-3 rounded-full border border-slate-200"
                  style={{ backgroundColor: catalogItem.color }}
                  aria-hidden
                />
                {catalogItem.color}
              </dd>
            </div>
          </dl>
        </div>
      </InspectorSection>

      <InspectorDivider />

      <InspectorSection title="Capacidades del tipo">
        <ul className="space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-3">
          <CapabilityRow label="Reservas" enabled={catalogItem.supportsReservations} />
          <CapabilityRow label="TPV" enabled={catalogItem.supportsTpv} />
          <CapabilityRow label="Limpieza" enabled={catalogItem.supportsCleaning} />
          <CapabilityRow label="Inventario" enabled={catalogItem.supportsInventory} />
        </ul>
      </InspectorSection>
    </div>
  );
}
