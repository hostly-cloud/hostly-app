import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSalesDetailHref,
  parseSalesDetailRange,
} from "../../lib/analytics/analysis-navigation";

test("builds a sales detail link with the overview period", () => {
  assert.equal(
    buildSalesDetailHref({ dateFrom: "2026-08-26", dateTo: "2026-09-01" }),
    "/dashboard/analisis/ventas?dateFrom=2026-08-26&dateTo=2026-09-01",
  );
});

test("normalizes a reversed period when building and reading the link", () => {
  const href = buildSalesDetailHref({ dateFrom: "2026-09-01", dateTo: "2026-08-26" });
  assert.deepEqual(parseSalesDetailRange(href.split("?")[1] ?? ""), {
    dateFrom: "2026-08-26",
    dateTo: "2026-09-01",
  });
});

test("rejects incomplete or invalid date ranges", () => {
  assert.equal(parseSalesDetailRange("?dateFrom=2026-09-01"), null);
  assert.equal(
    parseSalesDetailRange("?dateFrom=2026-02-30&dateTo=2026-09-01"),
    null,
  );
});
