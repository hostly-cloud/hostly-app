import type { SalaEditorLibraryItem } from "@/lib/sala-editor/library/types";

export type SalaEditorElementPreviewProps = {
  item: SalaEditorLibraryItem;
  className?: string;
};

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function getPreviewFamily(item: SalaEditorLibraryItem): string {
  if (item.structuralKind != null) return "structure";
  if (item.landscapeKind != null) return "landscape";
  if (item.zoneType != null) return "zone";
  if (item.surfaceMaterial != null) return "surface";
  if (item.baseToolId != null) return "base";
  return "generic";
}

export function SalaEditorElementPreview({ item, className }: SalaEditorElementPreviewProps) {
  const classes = ["hostly-sala-element-preview", className].filter(Boolean).join(" ");

  return (
    <svg
      className={classes}
      viewBox="0 0 48 48"
      role="img"
      aria-label={`Vista previa de ${item.label}`}
      data-preview-family={getPreviewFamily(item)}
      data-preview-kind={
        item.structuralKind ??
        item.landscapeKind ??
        item.zoneType ??
        item.surfaceMaterial ??
        item.baseToolId ??
        "generic"
      }
    >
      <defs>
        <linearGradient id={`surface-${item.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--preview-fill-start, #ffffff)" />
          <stop offset="1" stopColor="var(--preview-fill-end, #edf6fa)" />
        </linearGradient>
        <pattern id={`wood-${item.id}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#d8bd96" />
          <path d="M0 0h8M0 4h8M3 0v4M6 4v4" stroke="#9c744b" strokeWidth="0.55" opacity="0.68" />
          <path d="M.5 2.1c2-.9 4 .8 7 0M.5 6.2c1.8-.8 4.2.7 7 0" stroke="#f3e5ce" strokeWidth="0.35" opacity="0.7" />
        </pattern>
        <pattern id={`stone-${item.id}`} width="10" height="8" patternUnits="userSpaceOnUse">
          <rect width="10" height="8" fill="#d5d7d3" />
          <path d="M0 4h10M5 0v4M2 4v4M8 4v4" stroke="#88908f" strokeWidth="0.55" opacity="0.7" />
          <circle cx="7.5" cy="2" r=".55" fill="#f5f5f0" opacity=".7" />
        </pattern>
        <pattern id={`grass-${item.id}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#b9d1a8" />
          <path d="M.5 5l1-3M2.5 6l1-4M4 5.5l1.4-3.8M5.2 5l-.5-2.2" stroke="#587e50" strokeWidth="0.55" opacity="0.82" />
        </pattern>
        <pattern id={`sand-${item.id}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#e8d6ae" />
          <circle cx="1" cy="2" r="0.38" fill="#aa8e59" />
          <circle cx="4.5" cy="4" r="0.34" fill="#bea36b" />
          <circle cx="3" cy=".8" r="0.25" fill="#fff4d8" />
        </pattern>
        <pattern id={`water-${item.id}`} width="12" height="8" patternUnits="userSpaceOnUse">
          <rect width="12" height="8" fill="#b9e2e9" />
          <path d="M0 2.5c2-1.6 4 1.6 6 0s4 1.6 6 0M0 6.5c2-1.6 4 1.6 6 0s4 1.6 6 0" stroke="#4d9ead" strokeWidth="0.65" fill="none" opacity="0.85" />
          <path d="M2 .7h5" stroke="#fff" strokeWidth=".6" opacity=".7" />
        </pattern>
        <pattern id={`tile-${item.id}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#eef1f3" />
          <path d="M0 0h8v8H0z" stroke="#aeb8bf" strokeWidth="0.55" fill="none" />
        </pattern>
      </defs>
      <rect
        x="1"
        y="1"
        width="46"
        height="46"
        rx="12"
        fill={`url(#surface-${item.id})`}
        className="hostly-sala-element-preview__surface"
      />
      <PreviewShape item={item} />
    </svg>
  );
}

function SurfacePreview({ item }: { item: SalaEditorLibraryItem }) {
  const material = item.surfaceMaterial;
  const patternId =
    material === "wood" || material === "deck"
      ? `wood-${item.id}`
      : material === "stone"
        ? `stone-${item.id}`
        : material === "grass"
          ? `grass-${item.id}`
          : material === "sand"
            ? `sand-${item.id}`
            : material === "water"
              ? `water-${item.id}`
              : material === "tile"
                ? `tile-${item.id}`
                : null;

  return (
    <g className="hostly-sala-element-preview__shape">
      <rect
        x="7"
        y="9"
        width="34"
        height="30"
        rx="6"
        fill={patternId ? `url(#${patternId})` : "rgba(157, 174, 185, 0.18)"}
        stroke="currentColor"
        strokeWidth="1.35"
      />
      {material === "carpet" ? (
        <path d="M11 15h26M11 21h26M11 27h26M11 33h26" {...strokeProps} opacity="0.52" />
      ) : null}
      {material === "custom" ? (
        <path d="M15 30l7-8 5 5 6-7" {...strokeProps} />
      ) : null}
    </g>
  );
}

function LandscapePreview({ item }: { item: SalaEditorLibraryItem }) {
  const kind = String(item.landscapeKind ?? "").toLowerCase();

  if (kind.includes("roundplanter") || kind.includes("circular")) {
    return (
      <g className="hostly-sala-element-preview__shape">
        <circle cx="25" cy="25" r="17" className="hostly-sala-element-preview__planter-shell" />
        <circle cx="25" cy="25" r="13.5" className="hostly-sala-element-preview__planter-rim" />
        <circle cx="25" cy="25" r="10.5" className="hostly-sala-element-preview__planter-soil" />
        <ellipse cx="21" cy="22" rx="6" ry="4" className="hostly-sala-element-preview__foliage" transform="rotate(-25 21 22)" />
        <ellipse cx="29" cy="21" rx="6" ry="4" className="hostly-sala-element-preview__foliage is-light" transform="rotate(25 29 21)" />
        <ellipse cx="27" cy="29" rx="6" ry="4" className="hostly-sala-element-preview__foliage is-dark" transform="rotate(-10 27 29)" />
        <circle cx="19" cy="27" r="1.7" className="hostly-sala-element-preview__flower" />
        <circle cx="31" cy="25" r="1.5" className="hostly-sala-element-preview__flower is-white" />
      </g>
    );
  }

  if (kind.includes("planter") || kind.includes("jardinera")) {
    return (
      <g className="hostly-sala-element-preview__shape">
        <rect x="3" y="17" width="42" height="14" rx="4" className="hostly-sala-element-preview__planter-shell" />
        <rect x="6" y="19" width="36" height="10" rx="3" className="hostly-sala-element-preview__planter-rim" />
        <rect x="9" y="21" width="30" height="6" rx="2" className="hostly-sala-element-preview__planter-soil" />
        <ellipse cx="14" cy="24" rx="5" ry="3" className="hostly-sala-element-preview__foliage" />
        <ellipse cx="24" cy="23" rx="5.5" ry="3" className="hostly-sala-element-preview__foliage is-light" />
        <ellipse cx="35" cy="24" rx="5" ry="2.8" className="hostly-sala-element-preview__foliage is-dark" />
        <circle cx="19" cy="23" r="1.4" className="hostly-sala-element-preview__flower" />
        <circle cx="31" cy="24" r="1.3" className="hostly-sala-element-preview__flower is-white" />
      </g>
    );
  }

  if (kind.includes("palm") || kind.includes("palmera")) {
    return (
      <g className="hostly-sala-element-preview__shape">
        <path d="M24 24c-2-8-2-16 1-22 2 8 2 16-1 22Z" className="hostly-sala-element-preview__palm-leaf is-a" />
        <path d="M24 24c3-9 9-16 18-20-5 7-9 16-18 20Z" className="hostly-sala-element-preview__palm-leaf is-b" />
        <path d="M25 24c9-4 17-4 23-1-8 1-16 4-23 1Z" className="hostly-sala-element-preview__palm-leaf is-c" />
        <path d="M25 25c8 3 14 9 14 18-5-7-11-12-14-18Z" className="hostly-sala-element-preview__palm-leaf is-d" />
        <path d="M24 25c2 9-1 17-6 22 2-9 1-16 6-22Z" className="hostly-sala-element-preview__palm-leaf is-e" />
        <path d="M23 25c-8 5-16 7-22 4 8-1 15-4 22-4Z" className="hostly-sala-element-preview__palm-leaf is-f" />
        <path d="M23 24C15 23 8 18 5 11c6 5 13 7 18 13Z" className="hostly-sala-element-preview__palm-leaf is-g" />
        <circle cx="24" cy="24" r="3.2" className="hostly-sala-element-preview__trunk" />
      </g>
    );
  }

  if (kind.includes("olive") || kind.includes("olivo") || kind.includes("tree") || kind.includes("arbol")) {
    return (
      <g className="hostly-sala-element-preview__shape">
        <path d="M24 25l-8-8M24 25l8-7M24 25l9 8M24 25l-7 10" className="hostly-sala-element-preview__olive-branch" />
        <g className="hostly-sala-element-preview__olive-leaves">
          <ellipse cx="14" cy="16" rx="5" ry="3" transform="rotate(-25 14 16)" /><ellipse cx="21" cy="11" rx="5" ry="3" transform="rotate(18 21 11)" />
          <ellipse cx="31" cy="12" rx="5" ry="3" transform="rotate(-12 31 12)" /><ellipse cx="38" cy="19" rx="5" ry="3" transform="rotate(25 38 19)" />
          <ellipse cx="35" cy="29" rx="5" ry="3" transform="rotate(-18 35 29)" /><ellipse cx="31" cy="38" rx="5" ry="3" transform="rotate(12 31 38)" />
          <ellipse cx="20" cy="37" rx="5" ry="3" transform="rotate(-25 20 37)" /><ellipse cx="12" cy="30" rx="5" ry="3" transform="rotate(18 12 30)" />
          <ellipse cx="20" cy="23" rx="4.5" ry="2.7" transform="rotate(12 20 23)" /><ellipse cx="29" cy="24" rx="4.5" ry="2.7" transform="rotate(-20 29 24)" />
        </g>
        <circle cx="24" cy="25" r="2.4" className="hostly-sala-element-preview__trunk" />
      </g>
    );
  }

  return (
    <g className="hostly-sala-element-preview__shape">
      <circle cx="24" cy="19" r="10" {...strokeProps} />
      <path d="M24 29v9M17 35h14M17 16l7 7 7-7M18 23l6-6 6 6" {...strokeProps} />
    </g>
  );
}

function PreviewShape({ item }: { item: SalaEditorLibraryItem }) {
  if (item.structuralKind === "wall") return <g className="hostly-sala-element-preview__shape"><path d="M8 29h32M11 21h26M14 21v8M24 21v8M34 21v8" {...strokeProps} /></g>;
  if (item.structuralKind === "door") return <g className="hostly-sala-element-preview__shape"><path d="M11 37V11h17v26" {...strokeProps} /><path d="M28 11a17 17 0 0 1 17 17" {...strokeProps} /></g>;
  if (item.structuralKind === "glass") return <g className="hostly-sala-element-preview__shape"><rect x="10" y="12" width="28" height="24" rx="3" {...strokeProps} /><path d="M17 12v24M31 12v24" {...strokeProps} /></g>;
  if (item.structuralKind === "roundColumn") return <g className="hostly-sala-element-preview__shape"><circle cx="24" cy="24" r="10" {...strokeProps} /><circle cx="24" cy="24" r="4" {...strokeProps} /></g>;
  if (item.structuralKind === "squareColumn") return <g className="hostly-sala-element-preview__shape"><rect x="15" y="15" width="18" height="18" rx="2" {...strokeProps} /><rect x="20" y="20" width="8" height="8" rx="1" {...strokeProps} /></g>;
  if (item.structuralKind === "divider") return <g className="hostly-sala-element-preview__shape"><path d="M9 24h30M13 19v10M19 19v10M25 19v10M31 19v10M37 19v10" {...strokeProps} /></g>;

  if (item.landscapeKind != null) return <LandscapePreview item={item} />;
  if (item.zoneType != null) return <g className="hostly-sala-element-preview__shape"><rect x="8" y="9" width="32" height="30" rx="6" strokeDasharray="4 4" {...strokeProps} /><path d="M16 18h16M16 24h10" {...strokeProps} /></g>;
  if (item.surfaceMaterial != null) return <SurfacePreview item={item} />;
  if (item.baseToolId != null) return <g className="hostly-sala-element-preview__shape"><rect x="8" y="10" width="32" height="28" rx="6" {...strokeProps} /><path d="M13 16h22M13 23h22M13 30h22" {...strokeProps} opacity="0.6" /></g>;

  return <g className="hostly-sala-element-preview__shape"><rect x="11" y="11" width="26" height="26" rx="7" {...strokeProps} /></g>;
}
