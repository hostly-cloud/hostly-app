"use client";

import { SALA_STRUCTURAL_CATALOG } from "@/lib/sala-editor/catalog/structural-catalog";

export type SalaEstructuraPhasePanelProps = {
  espacioName?: string | null;
};

/**
 * Panel Fase 2 — elementos estructurales (scaffold).
 * Muestra catálogo futuro; sin lienzo ni persistencia.
 */
export function SalaEstructuraPhasePanel({
  espacioName,
}: SalaEstructuraPhasePanelProps) {
  return (
    <div className="flex min-h-[240px] flex-col gap-3">
      <p className="text-sm text-slate-600">
        {espacioName
          ? `Dentro de «${espacioName}» podrás colocar paredes, cristales, puertas y barras.`
          : "Selecciona un espacio para añadir estructura."}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SALA_STRUCTURAL_CATALOG.map((item) => (
          <li
            key={item.kind}
            className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5"
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
