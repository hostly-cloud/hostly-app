import {
  createOpenOrderViaApi,
  upsertSaleLinesViaApi,
} from "@/lib/firestore/tpv-mutations-via-api";
import type { ModifierStockConsumptionWarning } from "@/lib/inventory/stock-movement-types";
import type { SaleLineIntent } from "@/lib/server/tpv/tpv-mutation-dtos";
import { normalizeMenuCourseValue } from "@/lib/carta/menu-course";
import { buildHashedIdempotencyKey } from "@/lib/carta/tpv-release-idempotency-key";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";

/** Subconjunto mínimo de línea de carrito para el envío autoritativo. */
export type CartaReleaseCartLine = {
  id: string;
  product: { id: string };
  quantity: number;
  status?: string;
  selectedModifiers?: ReadonlyArray<{ groupId: string; optionId: string }>;
  lineNote?: string;
  course?: number;
  /** Última quantity autoritativa conocida en servidor. */
  serverQuantity?: number;
};

export type AuthoritativeLineSnapshot = {
  lineId: string;
  status: string;
  quantity: number;
  orderItemDocId?: string;
  course?: number;
};

export type SendCartaProductionReleaseParams = {
  tableId: string;
  tableLabel?: string;
  existingOrderId: string | null;
  /** Líneas que pasan a sent en esta acción. */
  linesToSend: readonly CartaReleaseCartLine[];
  /** Todas las líneas pending del carrito antes del envío (incluye linesToSend). */
  allPendingBeforeSend: readonly CartaReleaseCartLine[];
  releaseAction?: string;
};

export type SendCartaProductionReleaseSuccess = {
  ok: true;
  orderId: string;
  total: number;
  inventoryWarnings: ModifierStockConsumptionWarning[];
  items: AuthoritativeLineSnapshot[];
  /** true si el éxito viene de reconciliación (ya aplicado / timeout). */
  reconciled?: boolean;
};

export type SendFailureClass = "confirmed" | "uncertain" | "already_applied_unverified";

export type SendCartaProductionReleaseFailure = {
  ok: false;
  error: string;
  details?: string | null;
  failureClass: SendFailureClass;
  /** Si true, Carta debe revertir solo las líneas del envío. */
  shouldRollbackOptimistic: boolean;
};

export type SendCartaProductionReleaseResult =
  | SendCartaProductionReleaseSuccess
  | SendCartaProductionReleaseFailure;

export type SendCartaProductionReleaseDeps = {
  createOpenOrderViaApi?: typeof createOpenOrderViaApi;
  upsertSaleLinesViaApi?: typeof upsertSaleLinesViaApi;
  /** Resolver pedido abierto autoritativo por mesa (evita create duplicado). */
  resolveOpenOrderIdForTable?: (tableId: string) => Promise<string | null>;
  /** Lectura autoritativa de líneas por orderId (reconciliación). */
  readOrderLines?: (orderId: string) => Promise<AuthoritativeLineSnapshot[] | null>;
};

export function cartOrderLinesToSaleLineIntents(
  lines: readonly CartaReleaseCartLine[],
): SaleLineIntent[] {
  const out: SaleLineIntent[] = [];
  for (const line of lines) {
    const lineId = String(line.id ?? "").trim();
    const productId = String(line.product?.id ?? "").trim();
    const quantity = Math.floor(Number(line.quantity) || 0);
    if (!lineId || !productId || quantity <= 0) continue;

    let selectedModifiers: SaleLineIntent["selectedModifiers"];
    if (Array.isArray(line.selectedModifiers) && line.selectedModifiers.length > 0) {
      selectedModifiers = [];
      for (const row of line.selectedModifiers) {
        const groupId = String(row?.groupId ?? "").trim();
        const optionId = String(row?.optionId ?? "").trim();
        if (groupId && optionId) selectedModifiers.push({ groupId, optionId });
      }
      if (selectedModifiers.length === 0) selectedModifiers = undefined;
    }

    const note =
      typeof line.lineNote === "string" && line.lineNote.trim()
        ? line.lineNote.trim()
        : undefined;

    const course = normalizeMenuCourseValue(line.course);

    out.push({
      lineId,
      productId,
      quantity,
      selectedModifiers,
      note,
      ...(course != null ? { course } : {}),
    });
  }
  return out;
}

export function parseAuthoritativeLineSnapshots(
  items: readonly Record<string, unknown>[],
): AuthoritativeLineSnapshot[] {
  const out: AuthoritativeLineSnapshot[] = [];
  for (const item of items) {
    const lineId =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : typeof item.lineId === "string" && item.lineId.trim()
          ? item.lineId.trim()
          : "";
    if (!lineId) continue;
    const quantity = Math.floor(Number(item.quantity ?? item.qty) || 0);
    const status = normalizeProductionLineStatus(item.status);
    const orderItemDocId =
      typeof item.orderItemDocId === "string" && item.orderItemDocId.trim()
        ? item.orderItemDocId.trim()
        : undefined;
    const course = normalizeMenuCourseValue(item.course);
    out.push({
      lineId,
      status,
      quantity,
      ...(orderItemDocId ? { orderItemDocId } : {}),
      ...(course != null ? { course } : {}),
    });
  }
  return out;
}

export function isReleasedProductionStatus(status: unknown): boolean {
  const st = normalizeProductionLineStatus(status);
  return (
    st === "sent" ||
    st === "preparing" ||
    st === "prepared" ||
    st === "served"
  );
}

export function linesToSendAreReleasedOnServer(
  linesToSend: readonly CartaReleaseCartLine[],
  serverLines: readonly AuthoritativeLineSnapshot[],
): boolean {
  if (linesToSend.length === 0) return false;
  const byId = new Map(serverLines.map((l) => [l.lineId, l]));
  for (const line of linesToSend) {
    const id = String(line.id).trim();
    const server = byId.get(id);
    if (!server) return false;
    if (!isReleasedProductionStatus(server.status)) return false;
    const needQty = Math.floor(Number(line.quantity) || 0);
    if (server.quantity < needQty) return false;
  }
  return true;
}

function lineIdsKeyPart(lines: readonly SaleLineIntent[]): string[] {
  return lines.map((line) => line.lineId).sort();
}

function remainingPendingLines(
  allPendingBeforeSend: readonly CartaReleaseCartLine[],
  linesToSend: readonly CartaReleaseCartLine[],
): CartaReleaseCartLine[] {
  const sendIds = new Set(linesToSend.map((l) => String(l.id).trim()).filter(Boolean));
  return allPendingBeforeSend.filter((l) => {
    const id = String(l.id).trim();
    return id !== "" && !sendIds.has(id);
  });
}

function classifyApiError(error: string): SendFailureClass {
  if (error === "LINE_STATE_CONFLICT") return "already_applied_unverified";
  if (
    error === "STOCK_MOVEMENT_ID_CONFLICT" ||
    error === "UNAUTHORIZED" ||
    error === "FORBIDDEN" ||
    error === "TENANT_MISMATCH" ||
    error === "ORDER_NOT_FOUND" ||
    error === "TABLE_NOT_FOUND" ||
    error === "TABLE_TENANT_MISMATCH" ||
    error === "LINES_REQUIRED" ||
    error === "TABLE_ID_REQUIRED" ||
    error === "MULTIPLE_ACTIVE_ORDERS_FOR_TABLE" ||
    error === "LOCK_TENANT_MISMATCH" ||
    error === "LOCK_TABLE_MISMATCH" ||
    error === "TABLE_ALREADY_HAS_ACTIVE_ORDER" ||
    error === "IDEMPOTENCY_CONFLICT" ||
    error === "VERSION_CONFLICT"
  ) {
    return "confirmed";
  }
  // 401/403 a menudo llegan como UNAUTHORIZED desde fetch throw
  if (/UNAUTHORIZED|FORBIDDEN|401|403/i.test(error)) return "confirmed";
  return "uncertain";
}

function fail(
  error: string,
  details: string | null | undefined,
  failureClass: SendFailureClass,
  shouldRollbackOptimistic: boolean,
): SendCartaProductionReleaseFailure {
  return {
    ok: false,
    error,
    details: details ?? null,
    failureClass,
    shouldRollbackOptimistic,
  };
}

async function maybeReconcileSuccess(
  orderId: string | null,
  linesToSend: readonly CartaReleaseCartLine[],
  readOrderLines: SendCartaProductionReleaseDeps["readOrderLines"],
): Promise<SendCartaProductionReleaseSuccess | null> {
  if (!orderId?.trim() || !readOrderLines) return null;
  try {
    const serverLines = await readOrderLines(orderId.trim());
    if (!serverLines) return null;
    if (!linesToSendAreReleasedOnServer(linesToSend, serverLines)) return null;
    return {
      ok: true,
      orderId: orderId.trim(),
      total: 0,
      inventoryWarnings: [],
      items: serverLines,
      reconciled: true,
    };
  } catch {
    return null;
  }
}

/**
 * Persiste el envío Carta (pending→sent) vía mutaciones TPV autoritativas.
 * El consumo de inventario ocurre solo en el servidor (modifier_sale_v2 / recipe_sale_v2).
 */
export async function sendCartaProductionReleaseViaTpvApi(
  params: SendCartaProductionReleaseParams,
  deps: SendCartaProductionReleaseDeps = {},
): Promise<SendCartaProductionReleaseResult> {
  const createOpen = deps.createOpenOrderViaApi ?? createOpenOrderViaApi;
  const upsertSaleLines = deps.upsertSaleLinesViaApi ?? upsertSaleLinesViaApi;

  const tableId = params.tableId.trim();
  if (!tableId) {
    return fail("TABLE_ID_REQUIRED", null, "confirmed", true);
  }

  const linesToSendIntents = cartOrderLinesToSaleLineIntents(params.linesToSend);
  if (linesToSendIntents.length === 0) {
    return fail("LINES_REQUIRED", null, "confirmed", true);
  }

  const remainingPending = remainingPendingLines(
    params.allPendingBeforeSend,
    params.linesToSend,
  );
  const remainingIntents = cartOrderLinesToSaleLineIntents(remainingPending);
  const releaseAction =
    (params.releaseAction ?? "send_to_comanda").trim() || "send_to_comanda";
  let existingOrderId = params.existingOrderId?.trim() || null;

  // Evitar create-open duplicado si el listener aún no conoce el pedido.
  if (!existingOrderId && deps.resolveOpenOrderIdForTable) {
    try {
      const resolved = await deps.resolveOpenOrderIdForTable(tableId);
      if (resolved?.trim()) existingOrderId = resolved.trim();
    } catch {
      // Si falla la resolución, continuar; create-open usa idempotency.
    }
  }

  const toSuccess = async (
    orderId: string,
    total: number,
    inventoryWarnings: ModifierStockConsumptionWarning[],
    itemsRaw: Record<string, unknown>[] | AuthoritativeLineSnapshot[],
  ): Promise<SendCartaProductionReleaseSuccess> => {
    let items =
      itemsRaw.length > 0 && "lineId" in itemsRaw[0]!
        ? (itemsRaw as AuthoritativeLineSnapshot[])
        : parseAuthoritativeLineSnapshots(itemsRaw as Record<string, unknown>[]);
    if (items.length === 0 && deps.readOrderLines) {
      const reread = await deps.readOrderLines(orderId);
      if (reread) items = reread;
    }
    return {
      ok: true,
      orderId,
      total,
      inventoryWarnings,
      items,
    };
  };

  try {
    if (!existingOrderId) {
      if (remainingIntents.length === 0) {
        const idempotencyKey = await buildHashedIdempotencyKey(
          "carta-release-create-sent",
          releaseAction,
          tableId,
          ...lineIdsKeyPart(linesToSendIntents),
          ...linesToSendIntents.map((l) => `${l.lineId}:${l.quantity}:${l.course ?? ""}`),
        );
        const result = await createOpen({
          tableId,
          tableLabel: params.tableLabel,
          lines: linesToSendIntents,
          markSent: true,
          idempotencyKey,
        });
        if (!result.ok) {
          const cls = classifyApiError(result.error);
          if (cls === "already_applied_unverified" || cls === "uncertain") {
            // Sin orderId conocido: no se puede afirmar éxito.
            return fail(result.error, result.details, cls, cls !== "already_applied_unverified");
          }
          return fail(result.error, result.details, "confirmed", true);
        }
        return toSuccess(
          result.orderId,
          result.total,
          result.inventoryWarnings,
          result.items ?? [],
        );
      }

      const allPendingIntents = cartOrderLinesToSaleLineIntents(
        params.allPendingBeforeSend,
      );
      if (allPendingIntents.length === 0) {
        return fail("LINES_REQUIRED", null, "confirmed", true);
      }

      const createKey = await buildHashedIdempotencyKey(
        "carta-release-create-pending",
        releaseAction,
        tableId,
        ...lineIdsKeyPart(allPendingIntents),
      );
      const created = await createOpen({
        tableId,
        tableLabel: params.tableLabel,
        lines: allPendingIntents,
        markSent: false,
        idempotencyKey: createKey,
      });
      if (!created.ok) {
        return fail(
          created.error,
          created.details,
          classifyApiError(created.error),
          true,
        );
      }

      const upsertKey = await buildHashedIdempotencyKey(
        "carta-release-upsert-sent",
        releaseAction,
        created.orderId,
        ...lineIdsKeyPart(linesToSendIntents),
        ...linesToSendIntents.map((l) => `${l.lineId}:${l.quantity}`),
      );
      const sent = await upsertSaleLines({
        orderId: created.orderId,
        lines: linesToSendIntents,
        markSent: true,
        idempotencyKey: upsertKey,
      });
      if (!sent.ok) {
        const cls = classifyApiError(sent.error);
        if (cls === "already_applied_unverified" || sent.error === "LINE_STATE_CONFLICT") {
          const reconciled = await maybeReconcileSuccess(
            created.orderId,
            params.linesToSend,
            deps.readOrderLines,
          );
          if (reconciled) return reconciled;
        }
        if (cls === "uncertain") {
          const reconciled = await maybeReconcileSuccess(
            created.orderId,
            params.linesToSend,
            deps.readOrderLines,
          );
          if (reconciled) return reconciled;
          return fail(sent.error, sent.details, "uncertain", true);
        }
        return fail(sent.error, sent.details, "confirmed", true);
      }
      return toSuccess(
        sent.orderId,
        sent.total,
        sent.inventoryWarnings,
        sent.items ?? [],
      );
    }

    if (remainingIntents.length > 0) {
      const syncIntents = [...remainingIntents, ...linesToSendIntents];
      const syncKey = await buildHashedIdempotencyKey(
        "carta-release-upsert-pending",
        releaseAction,
        existingOrderId,
        ...lineIdsKeyPart(syncIntents),
      );
      const synced = await upsertSaleLines({
        orderId: existingOrderId,
        lines: syncIntents,
        markSent: false,
        idempotencyKey: syncKey,
      });
      if (!synced.ok) {
        const cls = classifyApiError(synced.error);
        if (synced.error === "LINE_STATE_CONFLICT") {
          // Sync pending puede chocar si alguna línea ya no es pending; intentar solo markSent.
        } else if (cls === "uncertain") {
          const reconciled = await maybeReconcileSuccess(
            existingOrderId,
            params.linesToSend,
            deps.readOrderLines,
          );
          if (reconciled) return reconciled;
          return fail(synced.error, synced.details, "uncertain", true);
        } else {
          return fail(synced.error, synced.details, "confirmed", true);
        }
      }
    }

    const sendKey = await buildHashedIdempotencyKey(
      "carta-release-upsert-sent",
      releaseAction,
      existingOrderId,
      ...lineIdsKeyPart(linesToSendIntents),
      ...linesToSendIntents.map((l) => `${l.lineId}:${l.quantity}`),
    );
    const sent = await upsertSaleLines({
      orderId: existingOrderId,
      lines: linesToSendIntents,
      markSent: true,
      idempotencyKey: sendKey,
    });
    if (!sent.ok) {
      if (sent.error === "LINE_STATE_CONFLICT") {
        const reconciled = await maybeReconcileSuccess(
          existingOrderId,
          params.linesToSend,
          deps.readOrderLines,
        );
        if (reconciled) return reconciled;
        return fail(sent.error, sent.details, "confirmed", true);
      }
      if (sent.error === "STOCK_MOVEMENT_ID_CONFLICT") {
        return fail(sent.error, sent.details, "confirmed", true);
      }
      const cls = classifyApiError(sent.error);
      if (cls === "uncertain") {
        const reconciled = await maybeReconcileSuccess(
          existingOrderId,
          params.linesToSend,
          deps.readOrderLines,
        );
        if (reconciled) return reconciled;
        return fail(sent.error, sent.details, "uncertain", true);
      }
      return fail(sent.error, sent.details, "confirmed", true);
    }
    return toSuccess(
      sent.orderId,
      sent.total,
      sent.inventoryWarnings,
      sent.items ?? [],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "NETWORK_ERROR";
    const cls = classifyApiError(msg);
    if (cls === "confirmed" && /UNAUTHORIZED|FORBIDDEN|401|403/i.test(msg)) {
      return fail(msg, null, "confirmed", true);
    }
    const orderHint = existingOrderId;
    const reconciled = await maybeReconcileSuccess(
      orderHint,
      params.linesToSend,
      deps.readOrderLines,
    );
    if (reconciled) return reconciled;
    // Timeout/red sin evidencia: rollback selectivo; listener puede rehidratar después.
    return fail(msg, null, "uncertain", true);
  }
}

/**
 * Rollback selectivo: restaura solo campos optimistas de las líneas del envío.
 * No pisa otras líneas editadas concurrentemente.
 */
export type ReleaseRollbackSnapshot = {
  status: string;
  sentAt?: number;
  inventoryCost?: unknown;
  orderItemDocId?: string;
};

export function rollbackReleaseLinesSelective<
  T extends {
    id: string;
    status: string;
    sentAt?: number;
    inventoryCost?: unknown;
    orderItemDocId?: string;
  },
>(
  current: readonly T[],
  previousByLineId: ReadonlyMap<string, ReleaseRollbackSnapshot>,
): T[] {
  return current.map((line) => {
    const prev = previousByLineId.get(line.id);
    if (!prev) return line;
    return {
      ...line,
      status: prev.status as T["status"],
      sentAt: prev.sentAt,
      inventoryCost: prev.inventoryCost as T["inventoryCost"],
      orderItemDocId: prev.orderItemDocId,
    };
  });
}

/**
 * Aplica snapshots autoritativos (lineId) sobre líneas locales tras un send OK.
 */
export function applyAuthoritativeSnapshotsToLines<
  T extends {
    id: string;
    status: string;
    quantity: number;
    orderItemDocId?: string;
    serverQuantity?: number;
    course?: number;
    sentAt?: number;
  },
>(
  lines: readonly T[],
  snapshots: readonly AuthoritativeLineSnapshot[],
  normalizeStatus: (raw: unknown) => T["status"],
): T[] {
  const byId = new Map(snapshots.map((s) => [s.lineId, s]));
  return lines.map((line) => {
    const snap = byId.get(line.id);
    if (!snap) return line;
    return {
      ...line,
      status: normalizeStatus(snap.status),
      orderItemDocId: snap.orderItemDocId ?? line.orderItemDocId,
      serverQuantity: snap.quantity,
      ...(snap.course != null ? { course: snap.course } : {}),
      ...(isReleasedProductionStatus(snap.status) && line.sentAt == null
        ? { sentAt: Date.now() }
        : {}),
    };
  });
}
