"use client";

export type SalaEspaciosEmptyStateProps = {
  onCreateEspacio: () => void;
  compact?: boolean;
};

function EspaciosEmptyIllustration() {
  return (
    <svg
      viewBox="0 0 160 120"
      className="mx-auto h-28 w-36 text-slate-300"
      aria-hidden
    >
      <rect
        x="12"
        y="18"
        width="136"
        height="84"
        rx="12"
        fill="currentColor"
        opacity="0.12"
      />
      <rect
        x="28"
        y="36"
        width="48"
        height="32"
        rx="6"
        fill="currentColor"
        opacity="0.22"
      />
      <rect
        x="84"
        y="36"
        width="48"
        height="48"
        rx="6"
        fill="currentColor"
        opacity="0.18"
      />
      <rect
        x="28"
        y="76"
        width="104"
        height="10"
        rx="5"
        fill="currentColor"
        opacity="0.16"
      />
      <circle cx="128" cy="30" r="8" fill="var(--hostly-accent)" opacity="0.35" />
    </svg>
  );
}

export function SalaEspaciosEmptyState({
  onCreateEspacio,
  compact = false,
}: SalaEspaciosEmptyStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] text-center",
        compact ? "px-4 py-8" : "min-h-[280px] flex-1 px-6 py-12",
      ].join(" ")}
    >
      <EspaciosEmptyIllustration />
      <p className="mt-4 text-base font-extrabold text-slate-800">
        Todavía no hay espacios
      </p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Crea el primer espacio para empezar a diseñar tu restaurante.
      </p>
      <button
        type="button"
        onClick={onCreateEspacio}
        className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--hostly-accent)] px-5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(49,95,125,0.22)] transition hover:brightness-105"
      >
        Crear espacio
      </button>
    </div>
  );
}
