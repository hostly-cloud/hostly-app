import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyRouteDestination } from "@/lib/navigation/legacy-route-redirect";

test("conserva filtros al consolidar una ruta heredada", () => {
  assert.equal(
    buildLegacyRouteDestination("/dashboard/operacion/tpv", {
      orderId: "order-1",
      tag: ["a", "b"],
    }),
    "/dashboard/operacion/tpv?orderId=order-1&tag=a&tag=b",
  );
});

test("la mesa de la ruta prevalece sobre un query obsoleto", () => {
  assert.equal(
    buildLegacyRouteDestination(
      "/dashboard/operacion/tpv",
      { tableId: "old", orderId: "order-1" },
      { tableId: "mesa-7" },
    ),
    "/dashboard/operacion/tpv?tableId=mesa-7&orderId=order-1",
  );
});
