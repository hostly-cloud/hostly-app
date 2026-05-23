import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import {
  DEFAULT_DRINK_MODIFIER_GROUP_SPECS,
  isModifierGroupType,
  normalizeModifierName,
  slugifyModifierOptionId,
  sortModifierGroups,
  sortModifierOptions,
  type ModifierGroupDocument,
  type ModifierGroupInput,
  type ModifierOptionDocument,
  type ModifierOptionInput,
} from "@/lib/modifiers/modifier-types";
import { normalizeModifierInventoryFields } from "@/lib/modifiers/modifier-inventory-consumption";

export function modifierGroupsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "modifierGroups");
}

export function modifierGroupDocRef(restaurantId: string, groupId: string) {
  return doc(modifierGroupsCollectionRef(restaurantId), groupId.trim());
}

function authUidOrThrow(): string {
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function readOptionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function clampSelectionCount(value: number, min = 0, max = 99): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseModifierOption(
  raw: unknown,
  index: number,
): ModifierOptionDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : "";
  if (!name) return null;
  const id =
    typeof data.id === "string" && data.id.trim()
      ? data.id.trim()
      : slugifyModifierOptionId(name);
  const normalizedName =
    typeof data.normalizedName === "string" && data.normalizedName.trim()
      ? data.normalizedName.trim()
      : normalizeModifierName(name);
  const priceDelta = readFiniteNumber(data.priceDelta, 0);
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? Math.floor(data.sortOrder)
      : index;
  const inventoryFields = normalizeModifierInventoryFields(data);
  return {
    id,
    name,
    normalizedName,
    priceDelta: Math.round(priceDelta * 100) / 100,
    active: data.active !== false,
    sortOrder,
    ...inventoryFields,
  };
}

export function parseModifierGroupDocument(
  groupId: string,
  raw: unknown,
  restaurantId: string,
): ModifierGroupDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string"
      ? data.restaurantId.trim()
      : restaurantId.trim();
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : "";
  const type = data.type;
  if (!name || !isModifierGroupType(type)) return null;

  const normalizedName =
    typeof data.normalizedName === "string" && data.normalizedName.trim()
      ? data.normalizedName.trim()
      : normalizeModifierName(name);
  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : Date.now();
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : createdAt;
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? Math.floor(data.sortOrder)
      : 0;
  const minSelected = clampSelectionCount(readFiniteNumber(data.minSelected, 0));
  const maxSelected = clampSelectionCount(
    readFiniteNumber(data.maxSelected, 1),
    0,
    99,
  );

  const optionsRaw = Array.isArray(data.options) ? data.options : [];
  const options = sortModifierOptions(
    optionsRaw
      .map((row, index) => parseModifierOption(row, index))
      .filter((row): row is ModifierOptionDocument => row != null),
  );

  return {
    id: groupId,
    restaurantId: rid,
    name,
    normalizedName,
    type,
    active: data.active !== false,
    required: data.required === true,
    minSelected,
    maxSelected: Math.max(minSelected, maxSelected),
    sortOrder,
    ...(readOptionalTrimmed(data.appliesToProductFamilyId)
      ? { appliesToProductFamilyId: readOptionalTrimmed(data.appliesToProductFamilyId) }
      : {}),
    ...(readOptionalTrimmed(data.appliesToCategoryId)
      ? { appliesToCategoryId: readOptionalTrimmed(data.appliesToCategoryId) }
      : {}),
    ...(readOptionalTrimmed(data.appliesToProductKind)
      ? { appliesToProductKind: readOptionalTrimmed(data.appliesToProductKind) }
      : {}),
    options,
    createdAt,
    updatedAt,
    ...(readOptionalTrimmed(data.createdBy)
      ? { createdBy: readOptionalTrimmed(data.createdBy) }
      : {}),
    ...(readOptionalTrimmed(data.updatedBy)
      ? { updatedBy: readOptionalTrimmed(data.updatedBy) }
      : {}),
  };
}

export function isDuplicateModifierGroupName(
  groups: ModifierGroupDocument[],
  name: string,
  excludeId?: string,
): boolean {
  const norm = normalizeModifierName(name);
  if (!norm) return false;
  const alt = normalizeProductName(name);
  return groups.some((g) => {
    if (excludeId && g.id === excludeId) return false;
    return (
      g.normalizedName === norm ||
      normalizeModifierName(g.name) === norm ||
      normalizeProductName(g.name) === alt
    );
  });
}

function normalizeOptionsInput(
  options: ModifierOptionInput[] | undefined,
  existing?: ModifierOptionDocument[],
): ModifierOptionDocument[] {
  if (!options) {
    return existing ? sortModifierOptions(existing) : [];
  }
  const existingById = new Map(
    (existing ?? []).map((opt) => [opt.id, opt] as const),
  );
  const usedIds = new Set<string>();
  const next: ModifierOptionDocument[] = [];

  options.forEach((input, index) => {
    const name = input.name.trim();
    if (!name) return;
    let id = input.id?.trim() || slugifyModifierOptionId(name);
    while (usedIds.has(id)) {
      id = `${id}-${index}`;
    }
    usedIds.add(id);
    const prev = existingById.get(id);
    const sortOrder =
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.floor(input.sortOrder)
        : (prev?.sortOrder ?? index);
    const priceDelta = readFiniteNumber(input.priceDelta, prev?.priceDelta ?? 0);
    const inventoryFields = normalizeModifierInventoryFields({
      inventoryProductId: input.inventoryProductId,
      inventoryProductName: input.inventoryProductName,
      inventoryQuantity: input.inventoryQuantity,
      inventoryUnit: input.inventoryUnit,
    });
    next.push({
      id,
      name,
      normalizedName: normalizeModifierName(name),
      priceDelta: Math.round(priceDelta * 100) / 100,
      active: input.active !== false,
      sortOrder,
      ...inventoryFields,
    });
  });

  return sortModifierOptions(next);
}

function buildModifierGroupPayload(
  restaurantId: string,
  input: ModifierGroupInput,
  uid: string,
  now: number,
  existing?: ModifierGroupDocument,
): Record<string, unknown> {
  const name = input.name.trim();
  const minSelected = clampSelectionCount(
    input.minSelected ?? existing?.minSelected ?? 0,
  );
  const maxSelected = clampSelectionCount(
    input.maxSelected ?? existing?.maxSelected ?? 1,
    minSelected,
    99,
  );
  const options = normalizeOptionsInput(input.options, existing?.options);

  const payload: Record<string, unknown> = {
    restaurantId: restaurantId.trim(),
    name,
    normalizedName: normalizeModifierName(name),
    type: input.type,
    active: input.active ?? existing?.active ?? true,
    required: input.required ?? existing?.required ?? false,
    minSelected,
    maxSelected,
    sortOrder:
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.floor(input.sortOrder)
        : (existing?.sortOrder ?? 0),
    options,
    updatedAt: now,
    updatedBy: uid,
  };

  const appliesFamily = readOptionalTrimmed(input.appliesToProductFamilyId);
  const appliesCategory = readOptionalTrimmed(input.appliesToCategoryId);
  const appliesKind = readOptionalTrimmed(input.appliesToProductKind);
  if (appliesFamily) payload.appliesToProductFamilyId = appliesFamily;
  if (appliesCategory) payload.appliesToCategoryId = appliesCategory;
  if (appliesKind) payload.appliesToProductKind = appliesKind;

  if (existing) {
    payload.createdAt = existing.createdAt;
    payload.createdBy = existing.createdBy ?? uid;
  } else {
    payload.createdAt = now;
    payload.createdBy = uid;
  }

  return payload;
}

async function fetchAllModifierGroups(
  restaurantId: string,
): Promise<ModifierGroupDocument[]> {
  const snap = await getDocs(
    query(modifierGroupsCollectionRef(restaurantId), orderBy("sortOrder", "asc")),
  );
  const rid = restaurantId.trim();
  const list: ModifierGroupDocument[] = [];
  snap.forEach((docSnap) => {
    const parsed = parseModifierGroupDocument(docSnap.id, docSnap.data(), rid);
    if (parsed) list.push(parsed);
  });
  return sortModifierGroups(list);
}

export function listenModifierGroups(
  restaurantId: string,
  onData: (groups: ModifierGroupDocument[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const q = query(
    modifierGroupsCollectionRef(rid),
    orderBy("sortOrder", "asc"),
  );

  return onSnapshot(
    q,
    (snap) => {
      const groups: ModifierGroupDocument[] = [];
      snap.forEach((docSnap) => {
        const parsed = parseModifierGroupDocument(
          docSnap.id,
          docSnap.data(),
          rid,
        );
        if (parsed) groups.push(parsed);
      });
      onData(sortModifierGroups(groups));
    },
    (error) => {
      onListenError?.(error);
    },
  );
}

export async function createModifierGroup(
  restaurantId: string,
  input: ModifierGroupInput,
): Promise<string> {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) throw new Error("UNAUTHORIZED");
  const name = input.name.trim();
  if (!name) throw new Error("MISSING_NAME");
  if (!isModifierGroupType(input.type)) throw new Error("INVALID_TYPE");

  const existing = await fetchAllModifierGroups(rid);
  if (isDuplicateModifierGroupName(existing, name)) {
    throw new Error("DUPLICATE_GROUP_NAME");
  }

  const uid = authUidOrThrow();
  const now = Date.now();
  const maxSort = existing.reduce((m, g) => Math.max(m, g.sortOrder), -1);
  const ref = doc(modifierGroupsCollectionRef(rid));
  const payload = buildModifierGroupPayload(
    rid,
    { ...input, sortOrder: input.sortOrder ?? maxSort + 1 },
    uid,
    now,
  );
  await setDoc(ref, payload);
  return ref.id;
}

export async function updateModifierGroup(
  restaurantId: string,
  groupId: string,
  input: Partial<ModifierGroupInput>,
): Promise<void> {
  const rid = restaurantId.trim();
  const gid = groupId.trim();
  if (!rid || !gid || !isAuthReady()) throw new Error("UNAUTHORIZED");

  const ref = modifierGroupDocRef(rid, gid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("GROUP_NOT_FOUND");
  const existing = parseModifierGroupDocument(gid, snap.data(), rid);
  if (!existing) throw new Error("GROUP_INVALID");

  const nextName = input.name?.trim() || existing.name;
  if (input.name?.trim()) {
    const all = await fetchAllModifierGroups(rid);
    if (isDuplicateModifierGroupName(all, nextName, gid)) {
      throw new Error("DUPLICATE_GROUP_NAME");
    }
  }

  const uid = authUidOrThrow();
  const now = Date.now();
  const merged: ModifierGroupInput = {
    name: nextName,
    type: input.type ?? existing.type,
    active: input.active ?? existing.active,
    required: input.required ?? existing.required,
    minSelected: input.minSelected ?? existing.minSelected,
    maxSelected: input.maxSelected ?? existing.maxSelected,
    sortOrder: input.sortOrder ?? existing.sortOrder,
    ...(input.appliesToProductFamilyId !== undefined
      ? { appliesToProductFamilyId: input.appliesToProductFamilyId }
      : existing.appliesToProductFamilyId
        ? { appliesToProductFamilyId: existing.appliesToProductFamilyId }
        : {}),
    ...(input.appliesToCategoryId !== undefined
      ? { appliesToCategoryId: input.appliesToCategoryId }
      : existing.appliesToCategoryId
        ? { appliesToCategoryId: existing.appliesToCategoryId }
        : {}),
    ...(input.appliesToProductKind !== undefined
      ? { appliesToProductKind: input.appliesToProductKind }
      : existing.appliesToProductKind
        ? { appliesToProductKind: existing.appliesToProductKind }
        : {}),
    options: input.options ?? existing.options.map((opt) => ({
      id: opt.id,
      name: opt.name,
      priceDelta: opt.priceDelta,
      active: opt.active,
      sortOrder: opt.sortOrder,
    })),
  };

  const payload = buildModifierGroupPayload(rid, merged, uid, now, existing);
  await updateDoc(ref, payload);
}

export async function disableModifierGroup(
  restaurantId: string,
  groupId: string,
): Promise<void> {
  await updateModifierGroup(restaurantId, groupId, { active: false });
}

export async function enableModifierGroup(
  restaurantId: string,
  groupId: string,
): Promise<void> {
  await updateModifierGroup(restaurantId, groupId, { active: true });
}

/** Crea «Formato bebida» y «Mixer» si faltan (ids fijos, idempotente). */
export async function ensureDefaultDrinkModifierGroups(
  restaurantId: string,
): Promise<number> {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) return 0;
  const uid = auth.currentUser?.uid?.trim() ?? "system";
  const now = Date.now();
  let created = 0;

  for (const spec of DEFAULT_DRINK_MODIFIER_GROUP_SPECS) {
    const ref = modifierGroupDocRef(rid, spec.id);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;

    const payload = buildModifierGroupPayload(
      rid,
      {
        name: spec.name,
        type: spec.type,
        active: true,
        required: spec.required,
        minSelected: spec.minSelected,
        maxSelected: spec.maxSelected,
        sortOrder: spec.sortOrder,
        options: spec.options.map((opt) => ({
          id: opt.id,
          name: opt.name,
          priceDelta: opt.priceDelta,
          active: true,
          sortOrder: opt.sortOrder,
        })),
      },
      uid,
      now,
    );
    await setDoc(ref, payload);
    created += 1;
  }

  return created;
}

export async function moveModifierGroupOrder(
  restaurantId: string,
  groupId: string,
  direction: "up" | "down",
): Promise<void> {
  const rid = restaurantId.trim();
  const gid = groupId.trim();
  if (!rid || !gid || !isAuthReady()) throw new Error("UNAUTHORIZED");

  const groups = await fetchAllModifierGroups(rid);
  const index = groups.findIndex((g) => g.id === gid);
  if (index < 0) throw new Error("GROUP_NOT_FOUND");
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= groups.length) return;

  const current = groups[index]!;
  const other = groups[swapIndex]!;
  await Promise.all([
    updateModifierGroup(rid, current.id, { sortOrder: other.sortOrder }),
    updateModifierGroup(rid, other.id, { sortOrder: current.sortOrder }),
  ]);
}
