import {
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { normalizeSupplierProductText } from "@/lib/inventory/invoice-product-matching";
import type {
  SupplierProductAliasDocument,
  SupplierProductAliasMatchCandidate,
  SupplierProductAliasUpdatePatch,
} from "@/lib/inventory/supplier-product-alias-types";

export type { SupplierProductAliasDocument, SupplierProductAliasMatchCandidate };

function readTimestampMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value && "toMillis" in value) {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function readTrimmedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function readBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

export function isSupplierProductAliasActiveForMatching(
  alias: Pick<SupplierProductAliasDocument, "active" | "deletedAt">,
): boolean {
  if (alias.active === false) return false;
  if (alias.deletedAt != null && alias.deletedAt > 0) return false;
  return true;
}

export function buildSupplierProductAliasDocId(normalizedText: string): string {
  const slug = normalizedText
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "alias";
}

export function supplierProductAliasesCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "supplierProductAliases");
}

export function supplierProductAliasDocRef(restaurantId: string, aliasId: string) {
  return doc(supplierProductAliasesCollectionRef(restaurantId), aliasId.trim());
}

export function normalizeSupplierProductAliasDocument(
  aliasId: string,
  raw: unknown,
  restaurantId: string,
): SupplierProductAliasDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : restaurantId.trim();
  if (!rid || rid !== restaurantId.trim()) return null;

  const rawText = readTrimmedString(data.rawText, 240);
  const normalizedText = readTrimmedString(data.normalizedText, 240);
  const inventoryProductId = readTrimmedString(data.inventoryProductId, 128);
  const inventoryProductName = readTrimmedString(data.inventoryProductName, 160);
  if (!rawText || !normalizedText || !inventoryProductId || !inventoryProductName) return null;

  const createdAt = readTimestampMs(data.createdAt);
  const updatedAt = readTimestampMs(data.updatedAt);
  if (createdAt == null) return null;

  const usageCountRaw = Number(data.usageCount);
  const usageCount =
    Number.isFinite(usageCountRaw) && usageCountRaw > 0 ? Math.floor(usageCountRaw) : 1;

  const matchSourceRaw = data.matchSource;
  const matchSource =
    matchSourceRaw === "manual" || matchSourceRaw === "auto" ? matchSourceRaw : "auto";

  return {
    id: aliasId.trim(),
    restaurantId: rid,
    rawText,
    normalizedText,
    inventoryProductId,
    inventoryProductName,
    supplierName: readTrimmedString(data.supplierName, 160),
    usageCount,
    active: readBoolean(data.active, true),
    createdAt,
    updatedAt: updatedAt ?? createdAt,
    lastUsedAt: readTimestampMs(data.lastUsedAt),
    deletedAt: readTimestampMs(data.deletedAt),
    learnedFromInvoiceId: readTrimmedString(data.learnedFromInvoiceId, 128),
    matchSource,
  };
}

export function mapSupplierProductAliasesToMatchCandidates(
  aliases: readonly SupplierProductAliasDocument[],
): SupplierProductAliasMatchCandidate[] {
  const bestByNormalized = new Map<string, SupplierProductAliasDocument>();
  for (const alias of aliases) {
    if (!isSupplierProductAliasActiveForMatching(alias)) continue;
    const existing = bestByNormalized.get(alias.normalizedText);
    if (!existing || alias.usageCount >= existing.usageCount) {
      bestByNormalized.set(alias.normalizedText, alias);
    }
  }
  return [...bestByNormalized.values()].map((alias) => ({
    normalizedText: alias.normalizedText,
    inventoryProductId: alias.inventoryProductId,
    inventoryProductName: alias.inventoryProductName,
  }));
}

export function listenSupplierProductAliases(
  restaurantId: string,
  onData: (aliases: SupplierProductAliasDocument[]) => void,
  options?: { limit?: number; onError?: (error: unknown) => void },
): Unsubscribe {
  const rid = restaurantId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 500, 1), 1000);
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const q = query(supplierProductAliasesCollectionRef(rid), limit(lim));
  return onSnapshot(
    q,
    (snap) => {
      const items: SupplierProductAliasDocument[] = [];
      for (const docSnap of snap.docs) {
        const parsed = normalizeSupplierProductAliasDocument(
          docSnap.id,
          docSnap.data(),
          rid,
        );
        if (parsed) items.push(parsed);
      }
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      onData(items);
    },
    (error) => {
      options?.onError?.(error);
      onData([]);
    },
  );
}

function buildAliasUpdatePayload(
  patch: SupplierProductAliasUpdatePatch,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (patch.inventoryProductId !== undefined) {
    payload.inventoryProductId = patch.inventoryProductId.trim().slice(0, 128);
  }
  if (patch.inventoryProductName !== undefined) {
    payload.inventoryProductName = patch.inventoryProductName.trim().slice(0, 160);
  }
  if (patch.active !== undefined) {
    payload.active = patch.active;
  }
  if (patch.usageCount !== undefined) {
    payload.usageCount = Math.max(0, Math.floor(patch.usageCount));
  }
  if (patch.matchSource !== undefined) {
    payload.matchSource = patch.matchSource;
  }
  if (patch.deletedAt !== undefined) {
    payload.deletedAt = patch.deletedAt;
  }

  return payload;
}

export type UpdateSupplierProductAliasParams = {
  restaurantId: string;
  aliasId: string;
  patch: SupplierProductAliasUpdatePatch;
};

export async function updateSupplierProductAlias(
  params: UpdateSupplierProductAliasParams,
): Promise<void> {
  const rid = params.restaurantId.trim();
  const aliasId = params.aliasId.trim();
  if (!rid || !aliasId || !isAuthReady()) {
    throw new Error("auth_or_params_unavailable");
  }

  const ref = supplierProductAliasDocRef(rid, aliasId);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    throw new Error("alias_not_found");
  }

  await setDoc(ref, buildAliasUpdatePayload(params.patch), { merge: true });
}

export type BulkUpdateSupplierProductAliasItem = {
  aliasId: string;
  patch: SupplierProductAliasUpdatePatch;
};

export async function bulkUpdateSupplierProductAliases(params: {
  restaurantId: string;
  updates: BulkUpdateSupplierProductAliasItem[];
}): Promise<{ succeeded: number; failed: number }> {
  const rid = params.restaurantId.trim();
  if (!rid || !isAuthReady()) {
    throw new Error("auth_or_params_unavailable");
  }

  const results = await Promise.allSettled(
    params.updates.map((item) =>
      updateSupplierProductAlias({
        restaurantId: rid,
        aliasId: item.aliasId,
        patch: item.patch,
      }),
    ),
  );

  let succeeded = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "fulfilled") succeeded += 1;
    else failed += 1;
  }
  return { succeeded, failed };
}

export type LearnSupplierProductAliasParams = {
  restaurantId: string;
  rawText: string;
  inventoryProductId: string;
  inventoryProductName: string;
  supplierName?: string | null;
  learnedFromInvoiceId?: string | null;
};

export async function learnSupplierProductAlias(
  params: LearnSupplierProductAliasParams,
): Promise<void> {
  const rid = params.restaurantId.trim();
  const rawText = params.rawText.trim().slice(0, 240);
  const inventoryProductId = params.inventoryProductId.trim();
  const inventoryProductName = params.inventoryProductName.trim().slice(0, 160);
  if (!rid || !rawText || !inventoryProductId || !inventoryProductName || !isAuthReady()) {
    return;
  }

  const normalizedText = normalizeSupplierProductText(rawText);
  if (!normalizedText) return;

  const aliasId = buildSupplierProductAliasDocId(normalizedText);
  const ref = supplierProductAliasDocRef(rid, aliasId);
  const existing = await getDoc(ref);
  const existingData = existing.exists() ? (existing.data() as Record<string, unknown>) : null;
  const preserveManualMatch = existingData?.matchSource === "manual";

  await setDoc(
    ref,
    {
      restaurantId: rid,
      rawText,
      normalizedText,
      inventoryProductId,
      inventoryProductName,
      ...(params.supplierName?.trim()
        ? { supplierName: params.supplierName.trim().slice(0, 160) }
        : {}),
      ...(params.learnedFromInvoiceId?.trim()
        ? { learnedFromInvoiceId: params.learnedFromInvoiceId.trim().slice(0, 128) }
        : {}),
      active: true,
      deletedAt: null,
      usageCount: increment(1),
      updatedAt: serverTimestamp(),
      lastUsedAt: serverTimestamp(),
      matchSource: preserveManualMatch ? "manual" : "auto",
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );
}

export type LearnSupplierProductAliasesFromLinesParams = {
  restaurantId: string;
  supplierName?: string | null;
  learnedFromInvoiceId?: string | null;
  lines: ReadonlyArray<{
    rawText?: string;
    detectedProductName?: string;
    matchedInventoryProductId?: string;
    matchedInventoryProductName?: string;
    included?: boolean;
  }>;
};

export async function learnSupplierProductAliasesFromLines(
  params: LearnSupplierProductAliasesFromLinesParams,
): Promise<void> {
  const tasks: Promise<void>[] = [];

  for (const line of params.lines) {
    if (line.included === false) continue;
    const productId = line.matchedInventoryProductId?.trim();
    const productName = line.matchedInventoryProductName?.trim();
    if (!productId || !productName) continue;

    const rawText = line.rawText?.trim() || line.detectedProductName?.trim();
    if (!rawText) continue;

    tasks.push(
      learnSupplierProductAlias({
        restaurantId: params.restaurantId,
        rawText,
        inventoryProductId: productId,
        inventoryProductName: productName,
        supplierName: params.supplierName,
        learnedFromInvoiceId: params.learnedFromInvoiceId,
      }),
    );
  }

  await Promise.allSettled(tasks);
}

export async function softDeleteSupplierProductAlias(params: {
  restaurantId: string;
  aliasId: string;
}): Promise<void> {
  await updateSupplierProductAlias({
    restaurantId: params.restaurantId,
    aliasId: params.aliasId,
    patch: {
      active: false,
      deletedAt: Date.now(),
    },
  });
}

export async function setSupplierProductAliasActive(params: {
  restaurantId: string;
  aliasId: string;
  active: boolean;
}): Promise<void> {
  await updateSupplierProductAlias({
    restaurantId: params.restaurantId,
    aliasId: params.aliasId,
    patch: {
      active: params.active,
      ...(params.active ? { deletedAt: null } : {}),
    },
  });
}

export async function resetSupplierProductAliasUsageCount(params: {
  restaurantId: string;
  aliasId: string;
}): Promise<void> {
  await updateSupplierProductAlias({
    restaurantId: params.restaurantId,
    aliasId: params.aliasId,
    patch: { usageCount: 0 },
  });
}
