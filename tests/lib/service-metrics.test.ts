import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeServiceMetrics } from "../../lib/operacion/service-metrics";

describe("service metrics", () => {
  test("calcula tiempos plausibles del servicio", () => {
    const metrics = computeServiceMetrics(
      [
        {
          status: "served",
          sentAt: 1_000,
          preparedAt: 10 * 60_000 + 1_000,
          servedAt: 15 * 60_000 + 1_000,
        },
      ],
      "all",
    );

    assert.equal(metrics.avgPrepMinutes, 10);
    assert.equal(metrics.avgServeMinutes, 5);
  });

  test("excluye intervalos antiguos que contaminarían la media", () => {
    const metrics = computeServiceMetrics(
      [
        {
          status: "served",
          sentAt: 1_000,
          preparedAt: 4 * 24 * 60 * 60_000 + 1_000,
          servedAt: 8 * 24 * 60 * 60_000 + 1_000,
        },
      ],
      "all",
    );

    assert.equal(metrics.served, 1);
    assert.equal(metrics.avgPrepMinutes, null);
    assert.equal(metrics.avgServeMinutes, null);
  });
});
