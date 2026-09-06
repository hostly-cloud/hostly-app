import assert from "node:assert/strict";
import test from "node:test";
import { resolveManagerAnalyticsRange } from "@/lib/ai/tools/get-manager-analytics-context";
import { buildHeuristicManagerAnalyticsReport } from "@/lib/ai/tools/generate-manager-analytics-report";
import type { ManagerAnalyticsContext } from "@/lib/ai/manager-analytics-types";

test("manager analytics compares an equal previous period", () => {
  assert.deepEqual(resolveManagerAnalyticsRange("2026-09-01", "2026-09-07"), {
    from: "2026-09-01",
    to: "2026-09-07",
    days: 7,
    previousFrom: "2026-08-25",
    previousTo: "2026-08-31",
  });
});

test("manager analytics rejects ranges above 31 days", () => {
  assert.throws(
    () => resolveManagerAnalyticsRange("2026-08-01", "2026-09-06"),
    /ANALYTICS_RANGE_TOO_LARGE/,
  );
});

test("heuristic manager report prioritizes verified operational pressure", () => {
  const context: ManagerAnalyticsContext = {
    range: { from: "2026-09-01", to: "2026-09-07", days: 7, previousFrom: "2026-08-25", previousTo: "2026-08-31" },
    sales: {
      total: 7500,
      payments: 100,
      averageTicket: 75,
      previousTotal: 10000,
      previousPayments: 110,
      previousAverageTicket: 90.91,
      deltaPercent: -25,
      averageTicketDeltaPercent: -17.5,
      cash: 2500,
      card: 5000,
      voucher: 0,
    },
    reservations: {
      total: 40,
      attended: 32,
      noShow: 6,
      noShowRate: 0.15,
      previousTotal: 38,
      previousNoShow: 2,
      previousNoShowRate: 2 / 38,
    },
    operations: { activeOrders: 8, pendingItems: 18, preparingItems: 7, readyItems: 16 },
    dataQuality: { alerts: [] },
  };

  const report = buildHeuristicManagerAnalyticsReport(context);
  assert.equal(report.signals.some((signal) => signal.key === "sales_drop" && signal.severity === "critical"), true);
  assert.equal(report.signals.some((signal) => signal.key === "pending_items"), true);
  assert.equal(report.signals.some((signal) => signal.key === "ready_items"), true);
  assert.equal(report.actions.some((action) => action.priority === "high"), true);
  assert.match(report.summary, /7\.500,00/);
});
