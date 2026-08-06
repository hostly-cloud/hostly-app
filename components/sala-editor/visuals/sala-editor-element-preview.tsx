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
          <rect width="8" height="8" fill="#ead9bf" />
          <path d="M0 2h8M0 6h8" stroke="#b88b59" strokeWidth="0.8" opacity="0.55" />
        </pattern>
        <pattern id={`stone-${item.id}`} width="10" height="8" patternUnits="userSpaceOnUse">
          <rect width="10" height="8" fill="#d9dee2" />
          <path d="M0 4h10M5 0v4M2 4v4M8 4v4" stroke="#8f9aa3" strokeWidth="0.7" opacity="0.55" />
        </pattern>
        <pattern id={`grass-${item.id}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#cfe4c8" />
          <path d="M1 5l1-3M3 6l1-4M5 5V2" stroke="#6d9b67" strokeWidth="0.7" opacity="0.7" />
        </pattern>
        <pattern id={`sand-${item.id}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#ead9ad" />
          <circle cx="1" cy="2" r="0.45" fill="#bfa56a" />
          <circle cx="4.5" cy="4" r="0.4" fill="#c8ad72" />
        </pattern>
        <pattern id={`water-${item.id}`} width="12" height="8" patternUnits="userSpaceOnUse">
          <rect width="12" height="8" fill="#ccebf4" />
          <path d="M0 3c2-2 4 2 6 0s4 2 6 0M0 7c2-2 4 2 6 0s4 2 6 0" stroke="#61aeca" strokeWidth="0.8" fill="none" opacity="0.8" />
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

  if (kind.includes("planter") || kind.includes("jardinera")) {
    return (
      <g className="hostly-sala-element-preview__shape">
        <rect x="8" y="25" width="32" height="11" rx="4" {...strokeProps} />
        <circle cx="16" cy="22" r="6" {...strokeProps} />
        <circle cx="24" cy="19" r="7" {...strokeProps} />
        <circle cx="33" cy="22" r="6" {...strokeProps} />
      </g>
    );
  }

  if (kind.includes("palm") || kind.includes("palmera")) {
    return (
      <g className="hostly-sala-element-preview__shape">
        <circle cx="24" cy="19" r="4" className="hostly-sala-element-preview__detail" />
        <path d="M24 19L12 10M24 19L36 10M24 19L9 20M24 19L39 20M24 19L15 31M24 19L33 31M24 23v15" {...strokeProps} />
      </g>
    );
  }

  if (kind.includes("olive") || kind.includes("olivo") || kind.includes("tree") || kind.includes("arbol")) {
    return (
      <g className="hostly-sala-element-preview__shape">
        <circle cx="18" cy="18" r="8" {...strokeProps} />
        <circle cx="29" cy="18" r="9" {...strokeProps} />
        <circle cx="24" cy="27" r="8" {...strokeProps} />
        <path d="M24 28v10" {...strokeProps} />
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
