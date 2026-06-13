import { HostlyStatusBadge } from "@/components/ui/hostly/data-table";
import { hostlyCx } from "@/components/ui/hostly/hostly-cx";
import type { MarginHealth } from "./escandallo-display-utils";
import { formatMarginDisplay, marginHealthLabel, marginHealthTone } from "./escandallo-display-utils";
import {
  escandalloVisualStateLabel,
  escandalloVisualStateTone,
  type EscandalloVisualState,
} from "./escandallo-row-visual-state";

export function HostlyCostBadge({
  value,
  className,
  title,
}: {
  value: string;
  className?: string;
  title?: string;
}) {
  return (
    <span className={hostlyCx("hostly-cost-badge", className)} title={title}>
      {value}
    </span>
  );
}

export function HostlyMarginBadge({
  marginPct,
  coste,
  venta,
  className,
  emphasize,
}: {
  marginPct: number | null;
  coste: number | null;
  venta: number | null;
  className?: string;
  emphasize?: boolean;
}) {
  const display = formatMarginDisplay(coste, venta);
  const tierClass =
    marginPct == null
      ? "hostly-margin-badge--none"
      : marginPct > 75
        ? "hostly-margin-badge--excelente"
        : marginPct >= 65
          ? "hostly-margin-badge--bueno"
          : marginPct >= 55
            ? "hostly-margin-badge--ajustado"
            : "hostly-margin-badge--peligro";

  return (
    <span
      className={hostlyCx("hostly-margin-badge", tierClass, emphasize && "hostly-margin-badge--emphasis", className)}
    >
      {display}
    </span>
  );
}

export function EscandalloRecipeStateBadge({ state }: { state: EscandalloVisualState }) {
  const label = escandalloVisualStateLabel(state);
  return (
    <HostlyStatusBadge tone={escandalloVisualStateTone(state)} aria-label={label}>
      {label}
    </HostlyStatusBadge>
  );
}

export function EscandalloMarginStatusBadge({ tier }: { tier: MarginHealth }) {
  const label = marginHealthLabel(tier);
  if (!label) {
    return (
      <HostlyStatusBadge tone="muted" aria-label="Sin margen">
        —
      </HostlyStatusBadge>
    );
  }
  return (
    <HostlyStatusBadge tone={marginHealthTone(tier)} aria-label={label}>
      {label}
    </HostlyStatusBadge>
  );
}
