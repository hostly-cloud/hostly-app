/** Utilidades de presentación escandallo (sin alterar fórmulas de negocio). */

export type EscandalloListRow = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

export type EscandalloDraft = {
  coste_total: string;
  precio_venta: string;
};

export type EscandalloDraftById = Record<string, EscandalloDraft>;

export type MarginHealth = "none" | "excelente" | "bueno" | "ajustado" | "peligro";

export function computeMarginPercent(costeTotal: number | null, precioVenta: number | null): number | null {
  if (precioVenta == null || precioVenta === 0) return null;
  if (costeTotal == null) return null;
  const m = ((precioVenta - costeTotal) / precioVenta) * 100;
  return Number.isFinite(m) ? m : null;
}

export function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function getDraftForItem(item: EscandalloListRow, drafts: EscandalloDraftById): EscandalloDraft {
  const key = String(item.id);
  return (
    drafts[key] ?? {
      coste_total: item.coste_total == null ? "" : String(item.coste_total),
      precio_venta: item.precio_venta == null ? "" : String(item.precio_venta),
    }
  );
}

export function marginHealthCategory(pct: number | null): MarginHealth {
  if (pct == null) return "none";
  if (pct > 75) return "excelente";
  if (pct >= 65) return "bueno";
  if (pct >= 55) return "ajustado";
  return "peligro";
}

export function formatMoney2(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundTo(value, 2));
}

export function formatMarginDisplay(costeTotal: number | null, precioVenta: number | null): string {
  const pct = computeMarginPercent(costeTotal, precioVenta);
  if (pct == null) return "—";
  return `${pct.toFixed(1).replace(".", ",")} %`;
}

export type EscandalloListStats = {
  sortedItems: EscandalloListRow[];
  avgMargin: number | null;
  bestKey: string | null;
  worstKey: string | null;
};

export function computeEscandalloListStats(items: EscandalloListRow[], drafts: EscandalloDraftById): EscandalloListStats {
  const entries = items.map((item) => {
    const key = String(item.id);
    const draft = getDraftForItem(item, drafts);
    const costeN = parseNullableNumber(draft.coste_total);
    const ventaN = parseNullableNumber(draft.precio_venta);
    const marginPct = computeMarginPercent(costeN, ventaN);
    return { item, key, marginPct };
  });

  const withMargin = entries.filter((e): e is (typeof entries)[number] & { marginPct: number } => e.marginPct != null);

  const avgMargin =
    withMargin.length > 0 ? withMargin.reduce((s, e) => s + e.marginPct, 0) / withMargin.length : null;

  let bestKey: string | null = null;
  let worstKey: string | null = null;
  if (withMargin.length >= 2) {
    const maxM = Math.max(...withMargin.map((e) => e.marginPct));
    const minM = Math.min(...withMargin.map((e) => e.marginPct));
    if (maxM !== minM) {
      const maxKeys = withMargin
        .filter((e) => e.marginPct === maxM)
        .map((e) => e.key)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const minKeys = withMargin
        .filter((e) => e.marginPct === minM)
        .map((e) => e.key)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      bestKey = maxKeys[0] ?? null;
      worstKey = minKeys[0] ?? null;
    }
  }

  const sortedItems = [...entries]
    .sort((a, b) => {
      if (a.marginPct == null && b.marginPct == null) {
        return (a.item.nombre_plato ?? "").localeCompare(b.item.nombre_plato ?? "", undefined, {
          sensitivity: "base",
        });
      }
      if (a.marginPct == null) return 1;
      if (b.marginPct == null) return -1;
      if (b.marginPct !== a.marginPct) return b.marginPct - a.marginPct;
      return (a.item.nombre_plato ?? "").localeCompare(b.item.nombre_plato ?? "", undefined, {
        sensitivity: "base",
      });
    })
    .map((e) => e.item);

  return { sortedItems, avgMargin, bestKey, worstKey };
}

export function marginHealthLabel(tier: MarginHealth): string | null {
  switch (tier) {
    case "excelente":
      return "Excelente";
    case "bueno":
      return "Bueno";
    case "ajustado":
      return "Ajustado";
    case "peligro":
      return "Peligro";
    default:
      return null;
  }
}

export function marginHealthTone(tier: MarginHealth): "success" | "warning" | "danger" | "muted" {
  switch (tier) {
    case "excelente":
    case "bueno":
      return "success";
    case "ajustado":
      return "warning";
    case "peligro":
      return "danger";
    default:
      return "muted";
  }
}
