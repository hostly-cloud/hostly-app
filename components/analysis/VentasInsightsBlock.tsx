import type {
  VentasSelectorsInsights,
  VentasTopZona,
} from "@/components/analysis/hooks/useVentasSelectors";

export type VentasZonaRendimientoInsight = {
  zoneName: string;
  ventas: number;
  ocupacion: number;
  ratio: number;
};

export type VentasZonasVentasInsights = {
  mejorRendimiento: VentasZonaRendimientoInsight | null;
  peorRendimiento: VentasZonaRendimientoInsight | null;
};

export type VentasZonaVentasAlerta = {
  zoneName: string;
  ventas: number;
  ocupacion: number;
  ratio: number;
};

export type VentasInsightsBlockProps = {
  data: VentasSelectorsInsights;
  topZonasVentas?: VentasTopZona[];
  zonasVentasInsights?: VentasZonasVentasInsights;
  zonasVentasAlertas?: VentasZonaVentasAlerta[];
  zonasVentasRecomendaciones?: string[];
};

export function VentasInsightsBlock({
  data,
  topZonasVentas,
  zonasVentasInsights,
  zonasVentasAlertas,
  zonasVentasRecomendaciones,
}: VentasInsightsBlockProps) {
  const hasSummary = data.summaryLines.length > 0;
  const hasTopZonas = Boolean(topZonasVentas && topZonasVentas.length > 0);
  const hasRendimientoZonas = Boolean(
    zonasVentasInsights?.mejorRendimiento || zonasVentasInsights?.peorRendimiento,
  );
  const hasAlertasZonas = Boolean(zonasVentasAlertas && zonasVentasAlertas.length > 0);

  if (!hasSummary && !hasTopZonas && !hasRendimientoZonas && !hasAlertasZonas) {
    return null;
  }

  return (
    <div
      className="hostly-card"
      style={{
        padding: 14,
        borderRadius: "var(--hostly-radius-md)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "rgba(15, 23, 42, 0.55)",
      }}
    >
      {hasSummary ? (
        <>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "#e2e8f0",
              letterSpacing: "-0.01em",
              marginBottom: 10,
            }}
          >
            Resumen de ventas
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
              color: "#cbd5e1",
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
              {i + 1}. {z.zoneName} — {z.total.toFixed(2)} €
            </div>
          ))}
        </div>
      )}
      {zonasVentasInsights?.mejorRendimiento && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Mejor rendimiento</div>
          <div style={{ fontSize: 13 }}>
            {zonasVentasInsights.mejorRendimiento.zoneName} —{" "}
            {zonasVentasInsights.mejorRendimiento.ventas.toFixed(2)} €
          </div>
        </div>
      )}
      {zonasVentasInsights?.peorRendimiento && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Peor rendimiento</div>
          <div style={{ fontSize: 13 }}>
            {zonasVentasInsights.peorRendimiento.zoneName} —{" "}
            {zonasVentasInsights.peorRendimiento.ventas.toFixed(2)} €
          </div>
        </div>
      )}
      {zonasVentasAlertas && zonasVentasAlertas.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Zonas con alto uso y bajo rendimiento</div>
          {zonasVentasAlertas.map((z, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              {z.zoneName} — {z.ventas.toFixed(2)} €
            </div>
          ))}
        </div>
      )}
      {zonasVentasRecomendaciones && zonasVentasRecomendaciones.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Recomendaciones</div>
          {zonasVentasRecomendaciones.map((r, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              • {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
