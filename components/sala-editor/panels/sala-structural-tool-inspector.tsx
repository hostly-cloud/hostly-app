"use client";

import type { ReactNode } from "react";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";

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

export type SalaStructuralToolInspectorProps = {
  tool: StructuralToolboxItem;
};

export function SalaStructuralToolInspector({
  tool,
}: SalaStructuralToolInspectorProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-0.5">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
        <p className="mt-1 text-xs text-slate-500">Herramienta seleccionada</p>
      </div>

      <InspectorSection title="Estructura">
        <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hostly-accent-soft)] text-xl"
              aria-hidden
            >
              {tool.icon}
            </span>
            <div>
              <p className="text-xs font-bold text-slate-500">Tipo</p>
              <p className="text-sm font-extrabold text-slate-900">{tool.label}</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            <span className="font-bold text-slate-700">Descripción</span>
            <br />
            {tool.description}
          </p>
        </div>
      </InspectorSection>

      <InspectorDivider />

      <InspectorSection title="Próximamente podrás">
        <ul className="space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-3">
          {tool.upcomingActions.map((action) => (
            <li
              key={action}
              className="flex items-center gap-2 text-xs font-semibold text-slate-600"
            >
              <span className="text-[var(--hostly-accent)]" aria-hidden>
                •
              </span>
              {action}
            </li>
          ))}
        </ul>
      </InspectorSection>
    </div>
  );
}
