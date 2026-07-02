"use client";

import { SALA_OPERATIONAL_CATALOG } from "@/lib/sala-editor/catalog/operational-catalog";

export type SalaOperacionPhasePanelProps = {
  espacioName?: string | null;
};

/**
 * Panel Fase 3 — elementos operativos (scaffold).
 * Muestra catálogo futuro; sin lienzo ni persistencia.
 */
export function SalaOperacionPhasePanel({
  espacioName,
}: SalaOperacionPhasePanelProps) {
  return (
    <div className="flex min-h-[240px] flex-col gap-3">
      <p className="text-sm text-slate-600">
        {espacioName
          ? `En «${espacioName}» colocarás mesas, hamacas y asientos de servicio.`
          : "Selecciona un mapa para añadir elementos operativos."}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SALA_OPERATIONAL_CATALOG.map((item) => (
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
