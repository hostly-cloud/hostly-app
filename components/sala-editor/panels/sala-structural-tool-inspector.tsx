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
    <section className="hostly-sala-editor-inspector__section">
      <h4 className="hostly-sala-editor-inspector__section-title">{title}</h4>
      {children}
    </section>
  );
}

export type SalaStructuralToolInspectorProps = {
  tool: StructuralToolboxItem;
  subtitle?: string;
};

export function SalaStructuralToolInspector({ tool }: SalaStructuralToolInspectorProps) {
  return (
    <div className="hostly-sala-editor-inspector">
      <InspectorSection title="Herramienta">
        <div className="hostly-sala-editor-inspector__card">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--hostly-accent-soft)] text-base"
              aria-hidden
            >
              {tool.icon}
            </span>
            <p className="text-xs font-extrabold text-slate-900">{tool.label}</p>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">{tool.description}</p>
        </div>
      </InspectorSection>

      <InspectorSection title="Próximamente">
        <ul className="hostly-sala-editor-inspector__card space-y-1 bg-slate-50/70 py-2">
          {tool.upcomingActions.map((action) => (
            <li
              key={action}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"
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
