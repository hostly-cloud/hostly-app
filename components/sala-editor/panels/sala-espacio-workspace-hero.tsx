"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { salaEspacioTypeIcon } from "@/lib/sala-editor/catalog/espacio-types";

function WorkspaceIllustration({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 320 200"
      className="mx-auto h-40 w-full max-w-md"
      aria-hidden
    >
      <defs>
        <pattern id="sala-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="rgba(148,163,184,0.18)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect x="8" y="8" width="304" height="184" rx="18" fill="url(#sala-grid)" />
      <rect
        x="36"
        y="34"
        width="120"
        height="72"
        rx="10"
        fill={color}
        opacity="0.14"
        stroke={color}
        strokeOpacity="0.35"
      />
      <rect
        x="176"
        y="34"
        width="108"
        height="108"
        rx="10"
        fill={color}
        opacity="0.1"
        stroke={color}
        strokeOpacity="0.28"
      />
      <rect
        x="36"
        y="122"
        width="248"
        height="14"
        rx="7"
        fill={color}
        opacity="0.12"
      />
      <circle cx="280" cy="42" r="10" fill={color} opacity="0.35" />
    </svg>
  );
}

export type SalaEspacioWorkspaceHeroProps = {
  espacio: SalaEspacio;
};

export function SalaEspacioWorkspaceHero({ espacio }: SalaEspacioWorkspaceHeroProps) {
  const icon = salaEspacioTypeIcon(espacio.tipo);

  return (
    <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_55%,#eef2f7_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <div
          className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
          style={{
            backgroundColor: `${espacio.color}18`,
            boxShadow: `inset 0 0 0 1px ${espacio.color}33`,
          }}
        >
          {icon}
        </div>

        <h3 className="text-3xl font-extrabold tracking-tight text-slate-900">
          {espacio.name}
        </h3>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
          Aquí construirás este espacio.
          <br />
          En la siguiente fase añadirás paredes, puertas, cristales y estructura.
        </p>

        <div className="mt-8 w-full max-w-xl">
          <WorkspaceIllustration color={espacio.color} />
        </div>
      </div>
    </div>
  );
}
