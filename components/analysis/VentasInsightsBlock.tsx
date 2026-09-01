import type {
  VentasSelectorsInsights,
  VentasTopZona,
} from "@/components/analysis/hooks/useVentasSelectors";
import { formatCurrency } from "@/components/analysis/utils";
import { Lightbulb } from "lucide-react";

export type VentasInsightsBlockProps = {
  data: VentasSelectorsInsights;
  topZonasVentas?: VentasTopZona[];
};

export function VentasInsightsBlock({
  data,
  topZonasVentas,
}: VentasInsightsBlockProps) {
  const hasSummary = data.summaryLines.length > 0;
  const hasTopZonas = Boolean(topZonasVentas && topZonasVentas.length > 0);
  if (!hasSummary && !hasTopZonas) {
    return null;
  }

  return (
    <div className="hostly-panel hostly-analysis-insights-card p-4">
      {hasSummary ? (
        <>
          <div className="hostly-analysis-card-title">
            <Lightbulb size={17} aria-hidden="true" />
            <span>Resumen de ventas</span>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--hostly-ink-muted)",
              lineHeight: 1.45,
            }}
          >
            {data.summaryLines.map((line, i) => (
              <li key={i} style={{ margin: 0 }}>
                {line}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {topZonasVentas && topZonasVentas.length > 0 && (
        <div style={{ marginTop: hasSummary ? 12 : 0 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
            Top zonas por ventas
          </div>
          {topZonasVentas.map((z, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              {i + 1}. {z.zoneName} — {formatCurrency(z.total)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
