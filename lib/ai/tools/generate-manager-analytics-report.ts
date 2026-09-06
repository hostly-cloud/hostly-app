import { generateText } from "ai";
import type {
  ManagerAnalyticsAction,
  ManagerAnalyticsContext,
  ManagerAnalyticsReport,
  ManagerAnalyticsResult,
  ManagerAnalyticsSeverity,
  ManagerAnalyticsSignal,
} from "@/lib/ai/manager-analytics-types";

const DEFAULT_MODEL = "openai/gpt-5-mini";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function formatPercent(value: number | null): string {
  if (value == null) return "sin base comparable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function fallbackSignals(context: ManagerAnalyticsContext): ManagerAnalyticsSignal[] {
  const out: ManagerAnalyticsSignal[] = [];
  const salesDelta = context.sales.deltaPercent;
  if (salesDelta != null && salesDelta <= -10) {
    out.push({
      key: "sales_drop",
      severity: salesDelta <= -25 ? "critical" : "watch",
      title: "Ventas por debajo del periodo anterior",
      detail: `La facturación cae ${Math.abs(salesDelta).toFixed(1)}% frente al periodo comparable.`,
      evidence: `${formatCurrency(context.sales.total)} vs ${formatCurrency(context.sales.previousTotal)}`,
    });
  } else if (salesDelta != null && salesDelta >= 10) {
    out.push({
      key: "sales_growth",
      severity: "positive",
      title: "Ventas creciendo",
      detail: `La facturación mejora ${salesDelta.toFixed(1)}% frente al periodo comparable.`,
      evidence: `${formatCurrency(context.sales.total)} vs ${formatCurrency(context.sales.previousTotal)}`,
    });
  }

  const noShowDelta = context.reservations.noShowRate - context.reservations.previousNoShowRate;
  if (context.reservations.total >= 5 && context.reservations.noShowRate >= 0.08) {
    out.push({
      key: "no_show",
      severity: context.reservations.noShowRate >= 0.15 ? "critical" : "watch",
      title: "No-shows a vigilar",
      detail: `El ${(context.reservations.noShowRate * 100).toFixed(1)}% de las reservas del periodo terminó en no-show.`,
      evidence: `${context.reservations.noShow} no-shows de ${context.reservations.total} reservas; variación ${(noShowDelta * 100).toFixed(1)} pp`,
    });
  }

  if (context.operations.pendingItems >= 5) {
    out.push({
      key: "pending_items",
      severity: context.operations.pendingItems >= 15 ? "critical" : "watch",
      title: "Comandas pendientes de envío",
      detail: "Hay producto todavía pendiente de enviar a cocina o barra.",
      evidence: `${context.operations.pendingItems} unidades pendientes`,
    });
  }

  if (context.operations.readyItems >= 5) {
    out.push({
      key: "ready_items",
      severity: context.operations.readyItems >= 15 ? "critical" : "watch",
      title: "Platos preparados esperando servicio",
      detail: "Hay acumulación de producto marcado como preparado que aún no figura como servido.",
      evidence: `${context.operations.readyItems} unidades preparadas`,
    });
  }

  if (out.length === 0) {
    out.push({
      key: "stable",
      severity: "neutral",
      title: "Sin alertas claras en el periodo",
      detail: "Los indicadores disponibles no muestran una desviación relevante con las reglas actuales.",
      evidence: `${formatCurrency(context.sales.total)} en ventas · ${context.reservations.total} reservas`,
    });
  }
  return out.slice(0, 5);
}

function fallbackActions(context: ManagerAnalyticsContext, signals: ManagerAnalyticsSignal[]): ManagerAnalyticsAction[] {
  const out: ManagerAnalyticsAction[] = [];
  if (signals.some((signal) => signal.key === "pending_items")) {
    out.push({ priority: "high", title: "Vaciar pendientes de comanda", reason: "Revisa qué mesas tienen líneas sin enviar y confirma cocina/barra antes de que aumente el retraso." });
  }
  if (signals.some((signal) => signal.key === "ready_items")) {
    out.push({ priority: "high", title: "Acelerar salida de platos preparados", reason: "Coordina sala con cocina/barra para reducir producto listo esperando servicio." });
  }
  if (signals.some((signal) => signal.key === "sales_drop")) {
    out.push({ priority: "medium", title: "Revisar la caída de ventas", reason: `Compara tickets, ticket medio y reservas: ventas ${formatPercent(context.sales.deltaPercent)} y ticket medio ${formatPercent(context.sales.averageTicketDeltaPercent)}.` });
  }
  if (signals.some((signal) => signal.key === "no_show")) {
    out.push({ priority: "medium", title: "Reducir no-shows", reason: "Revisa confirmaciones y recordatorios de las próximas reservas, empezando por servicios de mayor demanda." });
  }
  if (out.length === 0) {
    out.push({ priority: "low", title: "Mantener seguimiento", reason: "No hay una desviación crítica; usa el siguiente periodo comparable para confirmar la tendencia." });
  }
  return out.slice(0, 4);
}

export function buildHeuristicManagerAnalyticsReport(context: ManagerAnalyticsContext): ManagerAnalyticsReport {
  const signals = fallbackSignals(context);
  const actions = fallbackActions(context, signals);
  const salesDirection = context.sales.deltaPercent == null
    ? "sin una base previa suficiente"
    : context.sales.deltaPercent >= 0
      ? `un ${context.sales.deltaPercent.toFixed(1)}% por encima del periodo anterior`
      : `un ${Math.abs(context.sales.deltaPercent).toFixed(1)}% por debajo del periodo anterior`;
  return {
    headline: signals[0]?.title ?? "Resumen del negocio",
    summary: `Entre ${context.range.from} y ${context.range.to}, Hostly registra ${formatCurrency(context.sales.total)} en ventas, ${context.sales.payments} cobros y ${context.reservations.total} reservas. Las ventas están ${salesDirection}.`,
    signals,
    actions,
  };
}

type AiReportJson = {
  headline?: unknown;
  summary?: unknown;
  signals?: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
};

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function extractJson(text: string): AiReportJson | null {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" ? parsed as AiReportJson : null;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(candidate.slice(start, end + 1)) as AiReportJson; } catch { return null; }
  }
}

function severity(value: unknown): ManagerAnalyticsSeverity {
  return value === "positive" || value === "neutral" || value === "watch" || value === "critical" ? value : "neutral";
}

function validateAiReport(raw: AiReportJson, fallback: ManagerAnalyticsReport): ManagerAnalyticsReport {
  const signals: ManagerAnalyticsSignal[] = [];
  for (const item of raw.signals ?? []) {
    const title = cleanText(item.title, 100);
    const detail = cleanText(item.detail, 260);
    const evidence = cleanText(item.evidence, 180);
    if (!title || !detail || !evidence) continue;
    signals.push({ key: cleanText(item.key, 60) || `signal_${signals.length + 1}`, severity: severity(item.severity), title, detail, evidence });
    if (signals.length >= 5) break;
  }
  const actions: ManagerAnalyticsAction[] = [];
  for (const item of raw.actions ?? []) {
    const title = cleanText(item.title, 100);
    const reason = cleanText(item.reason, 260);
    if (!title || !reason) continue;
    const priority = item.priority === "high" || item.priority === "medium" || item.priority === "low" ? item.priority : "medium";
    actions.push({ priority, title, reason });
    if (actions.length >= 4) break;
  }
  return {
    headline: cleanText(raw.headline, 120) || fallback.headline,
    summary: cleanText(raw.summary, 500) || fallback.summary,
    signals: signals.length ? signals : fallback.signals,
    actions: actions.length ? actions : fallback.actions,
  };
}

function buildPrompt(context: ManagerAnalyticsContext): string {
  return [
    "You are Hostly Manager Analytics, an operational restaurant management assistant.",
    "All numerical facts MUST come only from the supplied JSON. Never invent causes, products, staff names, tables or forecasts.",
    "You may infer likely operational interpretations, but phrase uncertain causes as hypotheses to verify.",
    "Write in Spanish, concise and manager-oriented. Highlight what changed, what needs attention, and the next practical actions.",
    "Return JSON only with: headline, summary, signals[{key,severity,title,detail,evidence}], actions[{priority,title,reason}].",
    "severity: positive|neutral|watch|critical. priority: high|medium|low.",
    "Maximum 5 signals and 4 actions.",
    JSON.stringify(context),
  ].join("\n");
}

export async function generateManagerAnalyticsResult(params: {
  context: ManagerAnalyticsContext;
  restaurantId: string;
  userId: string;
}): Promise<ManagerAnalyticsResult> {
  const fallback = buildHeuristicManagerAnalyticsReport(params.context);
  const model = process.env.HOSTLY_AI_MANAGER_ANALYTICS_MODEL?.trim() || DEFAULT_MODEL;
  try {
    const result = await generateText({
      model,
      prompt: buildPrompt(params.context),
      maxRetries: 1,
      providerOptions: {
        gateway: {
          user: `restaurant:${params.restaurantId}:user:${params.userId}`,
          tags: ["hostly", "manager-analytics", params.restaurantId],
          disallowPromptTraining: true,
        },
      },
    });
    const parsed = extractJson(result.text);
    if (!parsed) throw new Error("INVALID_AI_JSON");
    return { generatedAtMs: Date.now(), source: "ai", model, context: params.context, report: validateAiReport(parsed, fallback) };
  } catch (error) {
    console.error("[manager-analytics] ai_generation_failed", {
      restaurantId: params.restaurantId,
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return { generatedAtMs: Date.now(), source: "heuristic", model: null, context: params.context, report: fallback };
  }
}
