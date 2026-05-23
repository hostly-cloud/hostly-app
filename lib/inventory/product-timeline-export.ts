import {
  PRODUCT_TIMELINE_FILTER_OPTIONS,
  type ProductTimelineDateRange,
  type ProductTimelineEvent,
  type ProductTimelineFilter,
  type ProductTimelineKpiSummary,
} from "@/lib/inventory/product-timeline";

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function csvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvEscape).join(";");
}

function formatFilterLabel(filter: ProductTimelineFilter): string {
  return (
    PRODUCT_TIMELINE_FILTER_OPTIONS.find((option) => option.id === filter)?.label ?? filter
  );
}

function formatDateRangeLabel(range: ProductTimelineDateRange): string {
  const parts: string[] = [];
  if (range.fromMs != null) {
    parts.push(`desde ${new Date(range.fromMs).toLocaleDateString("es-ES")}`);
  }
  if (range.toMs != null) {
    parts.push(`hasta ${new Date(range.toMs).toLocaleDateString("es-ES")}`);
  }
  return parts.length ? parts.join(" · ") : "Sin rango";
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("es-ES");
}

function formatNullableNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

function downloadTextFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export type ProductTimelineExportInput = {
  productId: string;
  productName: string;
  unit: string;
  events: readonly ProductTimelineEvent[];
  filter: ProductTimelineFilter;
  dateRange: ProductTimelineDateRange;
  kpis: ProductTimelineKpiSummary;
  /** Movimientos centrales fusionados en memoria al exportar. */
  loadedMovementCount?: number;
};

export function exportProductTimelineCsv(input: ProductTimelineExportInput): void {
  const exportedAt = new Date();
  const headers = [
    "timestamp",
    "eventType",
    "title",
    "subtitle",
    "delta",
    "unit",
    "stockBefore",
    "stockAfter",
    "supplierName",
    "purchaseOrderId",
    "invoiceId",
    "orderId",
    "severity",
  ];

  const meta = [
    csvLine(["# Hostly Timeline export"]),
    csvLine(["# Producto", input.productName]),
    csvLine(["# productId", input.productId]),
    csvLine(["# Filtro", formatFilterLabel(input.filter)]),
    csvLine(["# Rango", formatDateRangeLabel(input.dateRange)]),
    csvLine(["# Exportado", formatTimestamp(exportedAt.getTime())]),
    csvLine(["# Documento generado desde Hostly Timeline"]),
    csvLine([
      "# Alcance",
      input.loadedMovementCount != null
        ? `${input.events.length} evento(s) visibles · ${input.loadedMovementCount} movimiento(s) central cargado(s)`
        : "Exporta los eventos cargados actualmente",
    ]),
    "",
  ];

  const rows = input.events.map((event) =>
    csvLine([
      formatTimestamp(event.timestamp),
      event.type,
      event.title,
      event.subtitle ?? "",
      formatNullableNumber(event.delta),
      event.unit ?? input.unit,
      formatNullableNumber(event.stockBefore),
      formatNullableNumber(event.stockAfter),
      event.supplierName ?? "",
      event.purchaseOrderId ?? "",
      event.invoiceId ?? "",
      event.orderId ?? "",
      event.severity,
    ]),
  );

  const csvContent = [...meta, csvLine(headers), ...rows].join("\n");
  const safeName = input.productName.trim().replace(/[^\w\-]+/g, "_").slice(0, 40) || "producto";
  downloadTextFile(
    `hostly-timeline-${safeName}-${exportedAt.toISOString().slice(0, 10)}.csv`,
    "text/csv;charset=utf-8;",
    "\uFEFF" + csvContent,
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function exportProductTimelinePdf(input: ProductTimelineExportInput): void {
  const exportedAt = new Date();
  const filterLabel = formatFilterLabel(input.filter);
  const rangeLabel = formatDateRangeLabel(input.dateRange);

  const kpiRows: Array<[string, string | number]> = [
    ["Stock actual", input.kpis.currentStock ?? "—"],
    ["Consumo 14d", input.kpis.consumption14d],
    ["Coste actual", input.kpis.currentUnitCost ?? "—"],
    ["Último coste", input.kpis.lastUnitCost ?? "—"],
    ["Último proveedor", input.kpis.lastSupplierName ?? "—"],
    ["Ventas relacionadas", input.kpis.relatedSalesCount],
    ["Alertas", input.kpis.alertCount],
  ];

  const eventRows = input.events
    .map(
      (event) => `
    <tr>
      <td>${escapeHtml(formatTimestamp(event.timestamp))}</td>
      <td>${escapeHtml(event.type)}</td>
      <td>${escapeHtml(event.title)}</td>
      <td>${escapeHtml(event.subtitle ?? "")}</td>
      <td>${escapeHtml(formatNullableNumber(event.delta))}</td>
      <td>${escapeHtml(event.severity)}</td>
    </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Hostly Timeline · ${escapeHtml(input.productName)}</title>
  <style>
    @page { margin: 14mm; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.4; }
    .brand { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #64748b; margin-bottom: 16px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; }
    .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    .kpi-value { font-size: 13px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 6px 4px; text-align: left; vertical-align: top; }
    th { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #64748b; }
  </style>
</head>
<body>
  <div class="brand">Hostly · Inventario</div>
  <h1>Timeline operacional</h1>
  <div class="meta">
    <div><strong>${escapeHtml(input.productName)}</strong> · ${escapeHtml(input.productId)}</div>
    <div>Filtro: ${escapeHtml(filterLabel)} · ${escapeHtml(rangeLabel)} · ${input.events.length} evento(s)</div>
  </div>
  <div class="kpis">
    ${kpiRows
      .map(
        ([label, value]) => `
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${escapeHtml(String(value))}</div>
    </div>`,
      )
      .join("")}
  </div>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Tipo</th>
        <th>Título</th>
        <th>Subtítulo</th>
        <th>Δ</th>
        <th>Severidad</th>
      </tr>
    </thead>
    <tbody>
      ${eventRows || `<tr><td colspan="6">Sin eventos para los filtros activos.</td></tr>`}
    </tbody>
  </table>
  <footer>
    Documento generado desde Hostly Timeline · ${escapeHtml(formatTimestamp(exportedAt.getTime()))}
    · Exporta los eventos cargados actualmente${
      input.loadedMovementCount != null
        ? ` (${input.events.length} eventos · ${input.loadedMovementCount} movimientos central)`
        : ""
    }
  </footer>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
