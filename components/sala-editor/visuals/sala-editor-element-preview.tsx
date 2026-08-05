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

export function SalaEditorElementPreview({ item, className }: SalaEditorElementPreviewProps) {
  const classes = ["hostly-sala-element-preview", className].filter(Boolean).join(" ");

  return (
    <svg className={classes} viewBox="0 0 48 48" role="img" aria-label={`Vista previa de ${item.label}`}>
      <rect x="1" y="1" width="46" height="46" rx="12" className="hostly-sala-element-preview__surface" />
      <PreviewShape item={item} />
    </svg>
  );
}

function PreviewShape({ item }: { item: SalaEditorLibraryItem }) {
  if (item.operationalType === "TABLE") {
    if (item.visualVariant === "round") {
      return <g className="hostly-sala-element-preview__shape"><circle cx="24" cy="24" r="10" {...strokeProps} /><path d="M24 6v7M24 35v7M6 24h7M35 24h7" {...strokeProps} /><circle cx="24" cy="24" r="3" className="hostly-sala-element-preview__detail" /></g>;
    }
    if (item.visualVariant === "rectangular") {
      return <g className="hostly-sala-element-preview__shape"><rect x="11" y="17" width="26" height="14" rx="4" {...strokeProps} /><path d="M16 9v6M24 9v6M32 9v6M16 33v6M24 33v6M32 33v6" {...strokeProps} /></g>;
    }
    return <g className="hostly-sala-element-preview__shape"><rect x="15" y="15" width="18" height="18" rx="4" {...strokeProps} /><path d="M24 6v7M24 35v7M6 24h7M35 24h7" {...strokeProps} /></g>;
  }

  if (item.operationalType === "BAR_STRAIGHT") {
    return <g className="hostly-sala-element-preview__shape"><rect x="8" y="17" width="32" height="14" rx="5" {...strokeProps} /><path d="M14 12v5M24 12v5M34 12v5M14 31v5M24 31v5M34 31v5" {...strokeProps} /></g>;
  }

  if (item.operationalType === "BAR_L") {
    return <g className="hostly-sala-element-preview__shape"><path d="M12 10v26h24" {...strokeProps} /><path d="M18 16v14h12" {...strokeProps} /></g>;
  }

  if (item.operationalType != null) {
    return <g className="hostly-sala-element-preview__shape"><rect x="11" y="13" width="26" height="22" rx="6" {...strokeProps} /><path d="M17 24h14M24 17v14" {...strokeProps} /></g>;
  }

  if (item.structuralKind === "wall") return <g className="hostly-sala-element-preview__shape"><path d="M8 29h32M11 21h26M14 21v8M24 21v8M34 21v8" {...strokeProps} /></g>;
  if (item.structuralKind === "door") return <g className="hostly-sala-element-preview__shape"><path d="M11 37V11h17v26" {...strokeProps} /><path d="M28 11a17 17 0 0 1 17 17" {...strokeProps} /></g>;
  if (item.structuralKind === "glass") return <g className="hostly-sala-element-preview__shape"><rect x="10" y="12" width="28" height="24" rx="3" {...strokeProps} /><path d="M17 12v24M31 12v24" {...strokeProps} /></g>;
  if (item.structuralKind === "roundColumn") return <g className="hostly-sala-element-preview__shape"><circle cx="24" cy="24" r="10" {...strokeProps} /><circle cx="24" cy="24" r="4" {...strokeProps} /></g>;
  if (item.structuralKind === "squareColumn") return <g className="hostly-sala-element-preview__shape"><rect x="15" y="15" width="18" height="18" rx="2" {...strokeProps} /><rect x="20" y="20" width="8" height="8" rx="1" {...strokeProps} /></g>;
  if (item.structuralKind === "divider") return <g className="hostly-sala-element-preview__shape"><path d="M9 24h30M13 19v10M19 19v10M25 19v10M31 19v10M37 19v10" {...strokeProps} /></g>;

  if (item.landscapeKind != null) return <g className="hostly-sala-element-preview__shape"><circle cx="24" cy="19" r="10" {...strokeProps} /><path d="M24 29v9M17 35h14M17 16l7 7 7-7M18 23l6-6 6 6" {...strokeProps} /></g>;
  if (item.zoneType != null) return <g className="hostly-sala-element-preview__shape"><rect x="8" y="9" width="32" height="30" rx="6" strokeDasharray="4 4" {...strokeProps} /><path d="M16 18h16M16 24h10" {...strokeProps} /></g>;
  if (item.surfaceMaterial != null) return <g className="hostly-sala-element-preview__shape"><path d="M9 15h30M9 24h30M9 33h30M15 10v28M24 10v28M33 10v28" {...strokeProps} /></g>;

  return <g className="hostly-sala-element-preview__shape"><rect x="11" y="11" width="26" height="26" rx="7" {...strokeProps} /></g>;
}
