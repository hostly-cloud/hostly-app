import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { SaleLineIntent } from "@/lib/server/tpv/tpv-mutation-dtos";
import { parseSaleLineIntent } from "@/lib/server/tpv/tpv-mutation-dtos";
import { buildAuthoritativeSaleLine } from "@/lib/server/tpv/build-authoritative-sale-line";
import type { ProductDocument } from "@/lib/firestore/products";
import { buildHashedIdempotencyKey } from "@/lib/carta/tpv-release-idempotency-key";
import {
  applyAuthoritativeSnapshotsToLines,
  cartOrderLinesToSaleLineIntents,
  linesToSendAreReleasedOnServer,
  rollbackReleaseLinesSelective,
  sendCartaProductionReleaseViaTpvApi,
  type AuthoritativeLineSnapshot,
  type CartaReleaseCartLine,
} from "@/lib/carta/send-production-release-via-tpv-api";

const line = (
  id: string,
  productId: string,
  quantity: number,
  extras?: Partial<CartaReleaseCartLine>,
): CartaReleaseCartLine => ({
  id,
  product: { id: productId },
  quantity,
  ...extras,
});

function catalogProduct(partial: Partial<ProductDocument> & { id: string; name: string; price: number }): ProductDocument {
  return {
    restaurantId: "r1",
    active: true,
    ...partial,
  } as ProductDocument;
}

describe("cartOrderLinesToSaleLineIntents", () => {
  test("mapea lineId, productId, quantity, modifiers, note y course", () => {
    const intents = cartOrderLinesToSaleLineIntents([
      line("l1", "p1", 2, {
        lineNote: " sin hielo ",
        course: 3,
        selectedModifiers: [
          { groupId: "g1", optionId: "o1" },
          { groupId: "", optionId: "bad" },
        ],
      }),
      line("", "p2", 1),
      line("l3", "p3", 0),
    ]);
    assert.deepEqual(intents, [
      {
        lineId: "l1",
        productId: "p1",
        quantity: 2,
        selectedModifiers: [{ groupId: "g1", optionId: "o1" }],
        note: "sin hielo",
        course: 3,
      },
    ]);
  });

  test("omite course cuando no hay override", () => {
    const intents = cartOrderLinesToSaleLineIntents([line("a", "pa", 1)]);
    assert.equal(Object.prototype.hasOwnProperty.call(intents[0], "course"), false);
  });
});

describe("course override SaleLineIntent + buildAuthoritativeSaleLine", () => {
  test("catálogo course 1 + intent course 3 → persiste 3", () => {
    const parsed = parseSaleLineIntent({
      lineId: "l1",
      productId: "p1",
      quantity: 1,
      course: 3,
    });
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    const built = buildAuthoritativeSaleLine({
      intent: parsed,
      product: catalogProduct({ id: "p1", name: "Plato", price: 10, course: 1 }),
      modifiers: [],
      defaultStatus: "sent",
    });
    assert.equal(built.course, 3);
  });

  test("sin course en intent → usa catálogo", () => {
    const parsed = parseSaleLineIntent({
      lineId: "l1",
      productId: "p1",
      quantity: 1,
    });
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    const built = buildAuthoritativeSaleLine({
      intent: parsed,
      product: catalogProduct({ id: "p1", name: "Plato", price: 10, course: 2 }),
      modifiers: [],
    });
    assert.equal(built.course, 2);
  });

  test("course inválido (string) → COURSE_INVALID", () => {
    const parsed = parseSaleLineIntent({
      lineId: "l1",
      productId: "p1",
      quantity: 1,
      course: "3" as unknown as number,
    });
    assert.equal("error" in parsed, true);
    if ("error" in parsed) assert.equal(parsed.error, "COURSE_INVALID");
  });

  test("course fraccionario → COURSE_INVALID", () => {
    const parsed = parseSaleLineIntent({
      lineId: "l1",
      productId: "p1",
      quantity: 1,
      course: 2.5,
    });
    assert.equal("error" in parsed, true);
  });

  test("course fuera de rango → COURSE_INVALID", () => {
    const parsed = parseSaleLineIntent({
      lineId: "l1",
      productId: "p1",
      quantity: 1,
      course: 0,
    });
    assert.equal("error" in parsed, true);
  });
});

describe("sendCartaProductionReleaseViaTpvApi", () => {
  test("sin orderId y sin pending restantes → create-open markSent true", async () => {
    const calls: Array<{ kind: string; markSent?: boolean; lines: SaleLineIntent[] }> =
      [];
    const result = await sendCartaProductionReleaseViaTpvApi(
      {
        tableId: "mesa-1",
        tableLabel: "Mesa 1",
        existingOrderId: null,
        linesToSend: [line("a", "pa", 1, { course: 3 })],
        allPendingBeforeSend: [line("a", "pa", 1, { course: 3 })],
        releaseAction: "send_to_comanda",
      },
      {
        createOpenOrderViaApi: async (params) => {
          calls.push({
            kind: "create",
            markSent: params.markSent,
            lines: params.lines,
          });
          return {
            ok: true,
            orderId: "order-new",
            total: 10,
            inventoryWarnings: [],
          };
        },
        upsertSaleLinesViaApi: async () => {
          throw new Error("upsert no debe llamarse");
        },
        readOrderLines: async () => [
          { lineId: "a", status: "sent", quantity: 1, orderItemDocId: "oi-a", course: 3 },
        ],
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.orderId, "order-new");
    assert.equal(calls[0]!.markSent, true);
    assert.equal(calls[0]!.lines[0]!.course, 3);
    assert.equal(result.items[0]?.orderItemDocId, "oi-a");
  });

  test("sin orderId con pending restantes → create pending + upsert sent", async () => {
    const calls: Array<{ kind: string; markSent?: boolean; lineIds: string[] }> =
      [];
    const result = await sendCartaProductionReleaseViaTpvApi(
      {
        tableId: "mesa-1",
        existingOrderId: null,
        linesToSend: [line("a", "pa", 1)],
        allPendingBeforeSend: [line("a", "pa", 1), line("b", "pb", 1)],
        releaseAction: "march_primeros",
      },
      {
        createOpenOrderViaApi: async (params) => {
          calls.push({
            kind: "create",
            markSent: params.markSent,
            lineIds: params.lines.map((l) => l.lineId).sort(),
          });
          return {
            ok: true,
            orderId: "order-mixed",
            total: 0,
            inventoryWarnings: [],
          };
        },
        upsertSaleLinesViaApi: async (params) => {
          calls.push({
            kind: "upsert",
            markSent: params.markSent,
            lineIds: params.lines.map((l) => l.lineId).sort(),
          });
          return {
            ok: true,
            orderId: params.orderId,
            total: 12,
            items: [
              { id: "a", status: "sent", quantity: 1, orderItemDocId: "oi-a" },
              { id: "b", status: "pending", quantity: 1, orderItemDocId: "oi-b" },
            ],
            inventoryWarnings: [],
          };
        },
      },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      { kind: "create", markSent: false, lineIds: ["a", "b"] },
      { kind: "upsert", markSent: true, lineIds: ["a"] },
    ]);
  });

  test("pedido abierto no conocido localmente → resolve + upsert (no create)", async () => {
    const calls: string[] = [];
    const result = await sendCartaProductionReleaseViaTpvApi(
      {
        tableId: "mesa-1",
        existingOrderId: null,
        linesToSend: [line("a", "pa", 1)],
        allPendingBeforeSend: [line("a", "pa", 1)],
      },
      {
        resolveOpenOrderIdForTable: async () => "order-existing",
        createOpenOrderViaApi: async () => {
          calls.push("create");
          throw new Error("create no debe llamarse");
        },
        upsertSaleLinesViaApi: async (params) => {
          calls.push(`upsert:${params.orderId}:${params.markSent}`);
          return {
            ok: true,
            orderId: params.orderId,
            total: 5,
            items: [{ id: "a", status: "sent", quantity: 1 }],
            inventoryWarnings: [],
          };
        },
      },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["upsert:order-existing:true"]);
  });

  test("LINE_STATE_CONFLICT con líneas ya sent → éxito reconciliado", async () => {
    const result = await sendCartaProductionReleaseViaTpvApi(
      {
        tableId: "mesa-1",
        existingOrderId: "order-1",
        linesToSend: [line("a", "pa", 1)],
        allPendingBeforeSend: [line("a", "pa", 1)],
      },
      {
        upsertSaleLinesViaApi: async () => ({
          ok: false,
          error: "LINE_STATE_CONFLICT",
          details: "a",
        }),
        readOrderLines: async () => [
          { lineId: "a", status: "sent", quantity: 1, orderItemDocId: "oi-a" },
        ],
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.reconciled, true);
    assert.equal(result.items[0]?.orderItemDocId, "oi-a");
  });

  test("STOCK_MOVEMENT_ID_CONFLICT → error confirmed con rollback", async () => {
    const result = await sendCartaProductionReleaseViaTpvApi(
      {
        tableId: "mesa-1",
        existingOrderId: "order-1",
        linesToSend: [line("a", "pa", 1)],
        allPendingBeforeSend: [line("a", "pa", 1)],
      },
      {
        upsertSaleLinesViaApi: async () => ({
          ok: false,
          error: "STOCK_MOVEMENT_ID_CONFLICT",
        }),
        readOrderLines: async () => [
          { lineId: "a", status: "sent", quantity: 1 },
        ],
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "STOCK_MOVEMENT_ID_CONFLICT");
    assert.equal(result.failureClass, "confirmed");
    assert.equal(result.shouldRollbackOptimistic, true);
  });

  test("timeout/network con commit server → reconciliación éxito sin rollback", async () => {
    const result = await sendCartaProductionReleaseViaTpvApi(
      {
        tableId: "mesa-1",
        existingOrderId: "order-1",
        linesToSend: [line("a", "pa", 1)],
        allPendingBeforeSend: [line("a", "pa", 1)],
      },
      {
        upsertSaleLinesViaApi: async () => {
          throw new Error("NETWORK_ERROR");
        },
        readOrderLines: async () => [
          { lineId: "a", status: "preparing", quantity: 1, orderItemDocId: "oi-a" },
        ],
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.reconciled, true);
  });

  test("network antes del servidor (pending) → rollback", async () => {
    const result = await sendCartaProductionReleaseViaTpvApi(
      {
        tableId: "mesa-1",
        existingOrderId: "order-1",
        linesToSend: [line("a", "pa", 1)],
        allPendingBeforeSend: [line("a", "pa", 1)],
      },
      {
        upsertSaleLinesViaApi: async () => {
          throw new Error("Failed to fetch");
        },
        readOrderLines: async () => [
          { lineId: "a", status: "pending", quantity: 1 },
        ],
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.shouldRollbackOptimistic, true);
    assert.equal(result.failureClass, "uncertain");
  });

  test("propaga error de create-open confirmed", async () => {
    const result = await sendCartaProductionReleaseViaTpvApi(
      {
        tableId: "mesa-1",
        existingOrderId: null,
        linesToSend: [line("a", "pa", 1)],
        allPendingBeforeSend: [line("a", "pa", 1)],
      },
      {
        createOpenOrderViaApi: async () => ({
          ok: false,
          error: "TABLE_NOT_FOUND",
          details: "boom",
        }),
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "TABLE_NOT_FOUND");
    assert.equal(result.shouldRollbackOptimistic, true);
  });
});

describe("rollback selectivo y snapshots", () => {
  test("rollback no pisa otra línea editada", () => {
    type L = {
      id: string;
      status: string;
      sentAt?: number;
      quantity: number;
      note?: string;
    };
    const previous = new Map<string, Pick<L, "status" | "sentAt">>([
      ["a", { status: "pending", sentAt: undefined }],
    ]);
    const current: L[] = [
      { id: "a", status: "sent", sentAt: 1, quantity: 1 },
      { id: "b", status: "pending", quantity: 9, note: "editado-durante-envio" },
    ];
    const rolled = rollbackReleaseLinesSelective(current, previous);
    assert.equal(rolled.find((l) => l.id === "a")?.status, "pending");
    assert.equal(rolled.find((l) => l.id === "b")?.quantity, 9);
    assert.equal(rolled.find((l) => l.id === "b")?.note, "editado-durante-envio");
  });

  test("apply snapshots reconcilia orderItemDocId quantity status", () => {
    type L = {
      id: string;
      status: "pending" | "sent";
      quantity: number;
      orderItemDocId?: string;
      serverQuantity?: number;
      course?: number;
    };
    const lines: L[] = [
      {
        id: "a",
        status: "sent",
        quantity: 1,
      },
    ];
    const snaps: AuthoritativeLineSnapshot[] = [
      {
        lineId: "a",
        status: "sent",
        quantity: 1,
        orderItemDocId: "oi-1",
        course: 3,
      },
    ];
    const next = applyAuthoritativeSnapshotsToLines(lines, snaps, (s) =>
      String(s) === "sent" ? ("sent" as const) : ("pending" as const),
    );
    assert.equal(next[0]!.orderItemDocId, "oi-1");
    assert.equal(next[0]!.serverQuantity, 1);
    assert.equal(next[0]!.course, 3);
  });

  test("linesToSendAreReleasedOnServer exige cantidad suficiente", () => {
    assert.equal(
      linesToSendAreReleasedOnServer(
        [line("a", "p", 2)],
        [{ lineId: "a", status: "sent", quantity: 1 }],
      ),
      false,
    );
    assert.equal(
      linesToSendAreReleasedOnServer(
        [line("a", "p", 2)],
        [{ lineId: "a", status: "sent", quantity: 2 }],
      ),
      true,
    );
  });
});

describe("idempotency hashed keys", () => {
  test("estable para el mismo material", async () => {
    const a = await buildHashedIdempotencyKey("scope", "mesa", "l1", "l2");
    const b = await buildHashedIdempotencyKey("scope", "mesa", "l1", "l2");
    assert.equal(a, b);
    assert.ok(a.length <= 128);
  });

  test("distinta para intents distintos (sin colisión por prefijo)", async () => {
    const manyA = Array.from({ length: 40 }, (_, i) => `line-aaaaaaaa-${i}`);
    const manyB = Array.from({ length: 40 }, (_, i) => `line-bbbbbbbb-${i}`);
    const a = await buildHashedIdempotencyKey("carta-release-upsert-sent", ...manyA);
    const b = await buildHashedIdempotencyKey("carta-release-upsert-sent", ...manyB);
    assert.notEqual(a, b);
  });
});

describe("3B-1B guardia Carta sin writers stock/orders en send", () => {
  test("releaseLinesToProduction no usa writers cliente de stock ni orders", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sourcePath = join(
      here,
      "../../app/dashboard/carta/carta-page-content.tsx",
    );
    const source = readFileSync(sourcePath, "utf8");
    const start = source.indexOf("const releaseLinesToProduction = useCallback");
    assert.ok(start >= 0, "releaseLinesToProduction debe existir");
    const end = source.indexOf("const sendLinesToComanda = releaseLinesToProduction", start);
    assert.ok(end > start, "debe cerrar el callback");
    const body = source.slice(start, end);

    assert.equal(body.includes("createStockMovementsForModifierConsumption"), false);
    assert.equal(body.includes("createStockMovementsForRecipeConsumption"), false);
    assert.equal(body.includes("applyCreatedStockMovements"), false);
    assert.equal(body.includes("dbgAddDoc"), false);
    assert.equal(body.includes("dbgUpdateDoc"), false);
    assert.equal(body.includes("DbgWriteBatch"), false);
    assert.equal(body.includes("writeBatch"), false);
    assert.equal(body.includes("runTransaction"), false);
    assert.equal(body.includes("sendCartaProductionReleaseViaTpvApi"), true);
    assert.equal(body.includes("rollbackReleaseLinesSelective"), true);
  });
});
