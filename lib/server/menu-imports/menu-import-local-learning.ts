import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import type { ImportedMenuSuggestedStation } from "@/lib/carta/imported-menu-types";

export type MenuImportLearningSignal = {
  id: string;
  restaurantId: string;
  draftId: string;
  itemId: string;
  itemName: string;
  normalizedProductName: string;
  stationBefore?: ImportedMenuSuggestedStation;
  stationAfter?: ImportedMenuSuggestedStation;
  categoryBefore?: string;
  categoryAfter?: string;
  userId: string;
  createdAt: number;
};

export type MenuImportLearnedPreference = {
  normalizedProductName: string;
  station?: ImportedMenuSuggestedStation;
  stationSupport: number;
  stationConfidence: number;
  category?: string;
  categorySupport: number;
  categoryConfidence: number;
};

const MAX_RECENT_SIGNALS = 750;
const MIN_SUPPORT = 2;
const MIN_CONFIDENCE = 0.8;

function signalId(draftId: string, itemId: string): string {
  return createHash("sha256")
    .update(`${draftId.trim()}:${itemId.trim()}`)
    .digest("hex")
    .slice(0, 40);
}

function cleanOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

export function buildMenuImportLearningSignal(args: {
  restaurantId: string;
  draftId: string;
  itemId: string;
  itemName: string;
  userId: string;
  stationBefore?: ImportedMenuSuggestedStation;
  stationAfter?: ImportedMenuSuggestedStation;
  categoryBefore?: string;
  categoryAfter?: string;
  createdAt?: number;
}): MenuImportLearningSignal | null {
  const itemName = args.itemName.trim();
  const normalizedProductName = normalizeProductName(itemName);
  if (!itemName || !normalizedProductName) return null;

  const stationChanged =
    args.stationAfter !== undefined && args.stationBefore !== args.stationAfter;
  const categoryBefore = cleanOptionalString(args.categoryBefore);
  const categoryAfter = cleanOptionalString(args.categoryAfter);
  const categoryChanged =
    categoryAfter !== undefined && categoryBefore !== categoryAfter;

  if (!stationChanged && !categoryChanged) return null;

  return {
    id: signalId(args.draftId, args.itemId),
    restaurantId: args.restaurantId.trim(),
    draftId: args.draftId.trim(),
    itemId: args.itemId.trim(),
    itemName,
    normalizedProductName,
    ...(stationChanged
      ? { stationBefore: args.stationBefore, stationAfter: args.stationAfter }
      : {}),
    ...(categoryChanged
      ? { categoryBefore, categoryAfter }
      : {}),
    userId: args.userId.trim(),
    createdAt: args.createdAt ?? Date.now(),
  };
}

export async function persistMenuImportLearningSignals(args: {
  db: Firestore;
  restaurantId: string;
  signals: MenuImportLearningSignal[];
}): Promise<void> {
  if (args.signals.length === 0) return;
  const rid = args.restaurantId.trim();
  const batch = args.db.batch();
  const collection = args.db
    .collection("restaurants")
    .doc(rid)
    .collection("menuImportLearningSignals");

  for (const signal of args.signals.slice(0, 500)) {
    if (signal.restaurantId !== rid) continue;
    batch.set(collection.doc(signal.id), signal, { merge: false });
  }
  await batch.commit();
}

export async function loadRecentMenuImportLearningSignals(
  db: Firestore,
  restaurantId: string,
): Promise<MenuImportLearningSignal[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];
  const snap = await db
    .collection("restaurants")
    .doc(rid)
    .collection("menuImportLearningSignals")
    .orderBy("createdAt", "desc")
    .limit(MAX_RECENT_SIGNALS)
    .get();

  const signals: MenuImportLearningSignal[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Partial<MenuImportLearningSignal>;
    if (
      data.restaurantId !== rid ||
      typeof data.draftId !== "string" ||
      typeof data.itemId !== "string" ||
      typeof data.itemName !== "string" ||
      typeof data.normalizedProductName !== "string" ||
      typeof data.userId !== "string" ||
      typeof data.createdAt !== "number"
    ) {
      continue;
    }
    signals.push({
      id: doc.id,
      restaurantId: rid,
      draftId: data.draftId,
      itemId: data.itemId,
      itemName: data.itemName,
      normalizedProductName: data.normalizedProductName,
      ...(data.stationBefore ? { stationBefore: data.stationBefore } : {}),
      ...(data.stationAfter ? { stationAfter: data.stationAfter } : {}),
      ...(data.categoryBefore ? { categoryBefore: data.categoryBefore } : {}),
      ...(data.categoryAfter ? { categoryAfter: data.categoryAfter } : {}),
      userId: data.userId,
      createdAt: data.createdAt,
    });
  }
  return signals;
}

function dominantValue<T extends string>(
  values: T[],
): { value?: T; support: number; confidence: number } {
  if (values.length === 0) return { support: 0, confidence: 0 };
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [winner, support] = ranked[0]!;
  const tied = ranked.length > 1 && ranked[1]![1] === support;
  const confidence = support / values.length;
  if (tied || support < MIN_SUPPORT || confidence < MIN_CONFIDENCE) {
    return { support, confidence };
  }
  return { value: winner, support, confidence };
}

export function inferMenuImportLearnedPreference(
  signals: MenuImportLearningSignal[],
  itemName: string,
): MenuImportLearnedPreference | null {
  const normalizedProductName = normalizeProductName(itemName);
  if (!normalizedProductName) return null;
  const matching = signals.filter(
    (signal) => signal.normalizedProductName === normalizedProductName,
  );
  if (matching.length === 0) return null;

  const station = dominantValue(
    matching
      .map((signal) => signal.stationAfter)
      .filter((value): value is ImportedMenuSuggestedStation => Boolean(value)),
  );
  const category = dominantValue(
    matching
      .map((signal) => signal.categoryAfter)
      .filter((value): value is string => Boolean(value)),
  );

  if (!station.value && !category.value) return null;
  return {
    normalizedProductName,
    ...(station.value ? { station: station.value } : {}),
    stationSupport: station.support,
    stationConfidence: station.confidence,
    ...(category.value ? { category: category.value } : {}),
    categorySupport: category.support,
    categoryConfidence: category.confidence,
  };
}
