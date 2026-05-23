import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type FloorPlan = {
  id: string;
  restaurantId: string;
  name: string;
  /** Slug estable para integraciones / URLs internas (opcional en docs legacy). */
  slug?: string;
  width?: number;
  height?: number;
  sortOrder?: number;
  isDefault?: boolean;
  /** Si es `false`, el plano no aparece en TPV / picker operativo (legacy sin campo = activo). */
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

const COLLECTION = "floorPlans";
export const DEFAULT_FLOOR_PLAN_WIDTH = 1800;
export const DEFAULT_FLOOR_PLAN_HEIGHT = 1200;

/**
 * Tamaño lógico base del lienzo cuando no hay plano de referencia o el doc no trae dimensiones.
 * Los planos nuevos copian el canvas del plano canónico (p. ej. Principal) cuando existe.
 */
export const DEFAULT_FLOOR_PLAN_CONFIG = {
  width: DEFAULT_FLOOR_PLAN_WIDTH,
  height: DEFAULT_FLOOR_PLAN_HEIGHT,
} as const;

export type FloorPlanCanvasSize = {
  width: number;
  height: number;
};

function isPositiveFiniteDim(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Dimensiones del plano si están guardadas; si no, el default amplio estable.
 */
export function floorPlanCanvasOrDefaults(
  plan: FloorPlan | null | undefined,
): FloorPlanCanvasSize {
  const w = plan?.width;
  const h = plan?.height;
  if (isPositiveFiniteDim(w) && isPositiveFiniteDim(h)) {
    return { width: w, height: h };
  }
  return {
    width: DEFAULT_FLOOR_PLAN_CONFIG.width,
    height: DEFAULT_FLOOR_PLAN_CONFIG.height,
  };
}

/**
 * Plano de referencia del restaurante: `isDefault`, o el primero por `sortOrder` y nombre
 * (mismo criterio que `getFloorPlans`).
 */
export function pickCanonicalFloorPlan(
  plans: FloorPlan[],
): FloorPlan | null {
  if (plans.length === 0) return null;
  const def = plans.find((p) => p.isDefault === true);
  if (def) return def;
  const sorted = [...plans].sort((a, b) => {
    const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name, "es");
  });
  return sorted[0] ?? null;
}

/**
 * Plano Firestore al que pertenecen mesas/zonas **sin** `floorPlanId` (legacy).
 * Mismo criterio en editor, TPV y pickers: `isDefault`, o primero por sortOrder/nombre.
 */
export function legacyUnscopedFloorPlanAnchorId(
  plans: FloorPlan[],
): string | null {
  const c = pickCanonicalFloorPlan(plans);
  const id = c?.id != null ? String(c.id).trim() : "";
  return id.length > 0 ? id : null;
}

/**
 * ¿La mesa o zona pertenece al plano seleccionado?
 * - Con `floorPlanId` en el doc: debe coincidir con `selectedPlanId`.
 * - Sin `floorPlanId` (legacy): solo si `selectedPlanId` es el ancla legacy.
 */
export function entityBelongsToFloorPlan(
  entity: { floorPlanId?: string },
  selectedPlanId: string | null | undefined,
  allPlans: FloorPlan[],
): boolean {
  const sid = String(selectedPlanId ?? "").trim();
  if (!sid) return true;
  const fp =
    typeof entity.floorPlanId === "string" ? entity.floorPlanId.trim() : "";
  if (fp) return fp === sid;
  const anchor = legacyUnscopedFloorPlanAnchorId(allPlans);
  return anchor != null && sid === anchor;
}

/**
 * Canvas que debe tener un plano recién creado: igual al plano canónico existente (p. ej. Principal).
 * En **config/mesas** también define el lienzo lógico único del editor multi-plano (viewport, 100 %, ajuste, clamp).
 */
export function canvasSizeForNewFloorPlan(
  existingPlans: FloorPlan[],
): FloorPlanCanvasSize {
  return floorPlanCanvasOrDefaults(pickCanonicalFloorPlan(existingPlans));
}

/**
 * Dimensiones efectivas para editor / TPV / picker: cada eje ausente usa
 * `DEFAULT_FLOOR_PLAN_CONFIG` (mismo criterio que el antiguo fallback por plano).
 *
 * Importante: **no** rellena huecos con el canvas de otro plano del restaurante.
 * Hacerlo inflaba el rectángulo lógico (p. ej. principal heredando un ancho enorme
 * de otro doc) y el fit al viewport alejaba el zoom dejando las mesas microscópicas.
 */
export function resolveFloorPlanCanvasSize(
  plan: FloorPlan | null | undefined,
  _allPlans: FloorPlan[] = [],
): FloorPlanCanvasSize {
  void _allPlans;
  const w = plan?.width;
  const h = plan?.height;
  return {
    width: isPositiveFiniteDim(w) ? w : DEFAULT_FLOOR_PLAN_CONFIG.width,
    height: isPositiveFiniteDim(h) ? h : DEFAULT_FLOOR_PLAN_CONFIG.height,
  };
}

/** Completa solo `width`/`height` en memoria (sin tocar Firestore). */
export function normalizeFloorPlan(
  plan: FloorPlan,
  allPlans: FloorPlan[] = [],
): FloorPlan {
  const { width, height } = resolveFloorPlanCanvasSize(plan, allPlans);
  return { ...plan, width, height };
}

/** Id lógico por defecto en migraciones lazy cuando un doc antiguo no tiene `floorPlanId`. */
export const MAIN_FLOOR_PLAN_ID = "main-floor";

export function isFloorPlanOperational(plan: FloorPlan): boolean {
  return plan.active !== false;
}

/**
 * Plano efectivo de una mesa (joins, coherencia con el mapa).
 * Sin `floorPlanId` en el doc: mismo plano que el viewport si está definido;
 * si no, el ancla legacy del restaurante (`legacyUnscopedFloorPlanAnchorId`);
 * último recurso `MAIN_FLOOR_PLAN_ID`.
 */
export function effectiveTableFloorPlanId(
  table: { floorPlanId?: string } | undefined,
  viewportPlanId: string | null | undefined,
  restaurantFloorPlans?: FloorPlan[] | null,
): string {
  const fp = table?.floorPlanId?.trim();
  if (fp) return fp;
  const v = viewportPlanId?.trim();
  if (v) return v;
  if (restaurantFloorPlans && restaurantFloorPlans.length > 0) {
    const anchor = legacyUnscopedFloorPlanAnchorId(restaurantFloorPlans);
    if (anchor) return anchor;
  }
  return MAIN_FLOOR_PLAN_ID;
}

export function slugifyFloorPlanName(name: string): string {
  const base = String(name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || "plano";
}

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function mapDocToFloorPlan(d: QueryDocumentSnapshot): FloorPlan {
  const data = d.data() as Record<string, unknown>;
  const restaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? data.sortOrder
      : undefined;
  const width =
    typeof data.width === "number" && Number.isFinite(data.width) && data.width > 0
      ? data.width
      : undefined;
  const height =
    typeof data.height === "number" && Number.isFinite(data.height) && data.height > 0
      ? data.height
      : undefined;
  const isDefault =
    typeof data.isDefault === "boolean" ? data.isDefault : undefined;
  const slugRaw = data.slug;
  const slug =
    typeof slugRaw === "string" && slugRaw.trim() !== ""
      ? slugRaw.trim()
      : undefined;
  const active =
    typeof data.active === "boolean" ? data.active : undefined;
  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : undefined;
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : undefined;
  return {
    id: d.id,
    restaurantId,
    name,
    ...(slug !== undefined ? { slug } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    ...(isDefault !== undefined ? { isDefault } : {}),
    ...(active !== undefined ? { active } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

export async function createFloorPlan(
  restaurantId: string,
  name: string,
): Promise<{ id: string; name: string; width: number; height: number }> {
  const rid = restaurantId.trim();
  const n = String(name ?? "").trim();
  if (!rid) throw new Error("createFloorPlan: restaurantId no disponible");
  if (!n) throw new Error("createFloorPlan: nombre vacío");
  try {
    const existing = await getFloorPlans(rid);
    const maxSort = existing.reduce(
      (m, p) => Math.max(m, typeof p.sortOrder === "number" ? p.sortOrder : -1),
      -1,
    );
    const { width, height } = canvasSizeForNewFloorPlan(existing);
    const docRef = await addDoc(collection(db, COLLECTION), {
      restaurantId: rid,
      name: n,
      slug: slugifyFloorPlanName(n),
      active: true,
      sortOrder: maxSort + 1,
      width,
      height,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as DocumentData);
    return { id: docRef.id, name: n, width, height };
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[FLOOR_PLANS] create failed", {
        path: COLLECTION,
        restaurantId: rid,
        name: n,
        error: e,
      });
    }
    rethrowWithMessage(e);
  }
}

function sortFloorPlans(list: FloorPlan[]): FloorPlan[] {
  return [...list].sort((a, b) => {
    const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name, "es");
  });
}

export async function getFloorPlans(restaurantId: string): Promise<FloorPlan[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];
  try {
    const col = collection(db, COLLECTION);
    const snap = await getDocs(query(col, where("restaurantId", "==", rid)));
    return sortFloorPlans(snap.docs.map(mapDocToFloorPlan));
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/**
 * Escucha la colección `floorPlans` del restaurante (un listener por tenant).
 * El TPV filtra planos operativos y resuelve canvas con helpers existentes.
 */
export function listenFloorPlansByRestaurantId(
  restaurantId: string,
  callback: (floorPlans: FloorPlan[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const rid = restaurantId.trim();
  if (!rid) {
    onError?.(new Error("listenFloorPlans: restaurantId obligatorio"));
    callback([]);
    return () => {};
  }

  try {
    const q = query(collection(db, COLLECTION), where("restaurantId", "==", rid));
    return onSnapshot(
      q,
      (snap) => {
        try {
          callback(sortFloorPlans(snap.docs.map(mapDocToFloorPlan)));
        } catch (e) {
          onError?.(e instanceof Error ? e : new Error(String(e)));
        }
      },
      (error) => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      },
    );
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error(String(e)));
    return () => {};
  }
}

export async function createDefaultFloorPlanIfNeeded(
  restaurantId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  if (!rid) return;
  try {
    const existing = await getFloorPlans(rid);
    if (existing.length > 0) return;
    await addDoc(collection(db, COLLECTION), {
      restaurantId: rid,
      name: "Principal",
      slug: "principal",
      active: true,
      ...DEFAULT_FLOOR_PLAN_CONFIG,
      isDefault: true,
      sortOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as DocumentData);
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export type FloorPlanUpdatePayload = {
  name?: string;
  slug?: string;
  width?: number;
  height?: number;
  sortOrder?: number;
  isDefault?: boolean;
  active?: boolean;
};

export async function updateFloorPlan(
  floorPlanId: string,
  updates: FloorPlanUpdatePayload,
): Promise<void> {
  const id = String(floorPlanId ?? "").trim();
  if (!id) throw new Error("updateFloorPlan: floorPlanId no disponible");
  const payload: DocumentData = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) {
    const n = String(updates.name ?? "").trim();
    if (!n) throw new Error("updateFloorPlan: nombre vacío");
    payload.name = n;
  }
  if (updates.slug !== undefined) {
    const s = String(updates.slug ?? "").trim();
    if (s) payload.slug = s;
  }
  if (updates.width !== undefined) {
    if (
      typeof updates.width !== "number" ||
      !Number.isFinite(updates.width) ||
      updates.width <= 0
    ) {
      throw new Error("updateFloorPlan: width inválida");
    }
    payload.width = updates.width;
  }
  if (updates.height !== undefined) {
    if (
      typeof updates.height !== "number" ||
      !Number.isFinite(updates.height) ||
      updates.height <= 0
    ) {
      throw new Error("updateFloorPlan: height inválida");
    }
    payload.height = updates.height;
  }
  if (updates.sortOrder !== undefined) {
    if (typeof updates.sortOrder !== "number" || !Number.isFinite(updates.sortOrder)) {
      throw new Error("updateFloorPlan: sortOrder inválido");
    }
    payload.sortOrder = updates.sortOrder;
  }
  if (updates.isDefault !== undefined) {
    payload.isDefault = updates.isDefault;
  }
  if (updates.active !== undefined) {
    payload.active = updates.active;
  }
  try {
    await updateDoc(doc(db, COLLECTION, id), payload);
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function duplicateFloorPlan(
  restaurantId: string,
  sourcePlanId: string,
): Promise<{ id: string; name: string }> {
  const rid = restaurantId.trim();
  const sid = String(sourcePlanId ?? "").trim();
  if (!rid) throw new Error("duplicateFloorPlan: restaurantId no disponible");
  if (!sid) throw new Error("duplicateFloorPlan: sourcePlanId no disponible");
  try {
    const ref = doc(db, COLLECTION, sid);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("duplicateFloorPlan: plano no encontrado");
    const data = snap.data() as Record<string, unknown>;
    if (String(data.restaurantId ?? "").trim() !== rid) {
      throw new Error("duplicateFloorPlan: restaurante no coincide");
    }
    const sourceName =
      typeof data.name === "string" && data.name.trim()
        ? data.name.trim()
        : "Plano";
    const existing = await getFloorPlans(rid);
    const sourcePartial: FloorPlan = {
      id: sid,
      restaurantId: rid,
      name: sourceName,
      width:
        typeof data.width === "number" &&
        Number.isFinite(data.width) &&
        data.width > 0
          ? data.width
          : undefined,
      height:
        typeof data.height === "number" &&
        Number.isFinite(data.height) &&
        data.height > 0
          ? data.height
          : undefined,
    };
    const others = existing.filter((p) => p.id !== sid);
    const fb = canvasSizeForNewFloorPlan(others.length > 0 ? others : existing);
    const width = isPositiveFiniteDim(sourcePartial.width)
      ? sourcePartial.width
      : fb.width;
    const height = isPositiveFiniteDim(sourcePartial.height)
      ? sourcePartial.height
      : fb.height;
    const maxSort = existing.reduce(
      (m, p) => Math.max(m, typeof p.sortOrder === "number" ? p.sortOrder : -1),
      -1,
    );
    const name = `Copia de ${sourceName}`;
    const docRef = await addDoc(collection(db, COLLECTION), {
      restaurantId: rid,
      name,
      slug: `${slugifyFloorPlanName(name)}-${Date.now().toString(36).slice(-4)}`,
      active: true,
      width,
      height,
      sortOrder: maxSort + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as DocumentData);
    return { id: docRef.id, name };
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function moveFloorPlanOrder(
  restaurantId: string,
  floorPlanId: string,
  direction: "up" | "down",
): Promise<void> {
  const rid = restaurantId.trim();
  const pid = String(floorPlanId ?? "").trim();
  if (!rid || !pid) throw new Error("moveFloorPlanOrder: ids no disponibles");
  const plans = await getFloorPlans(rid);
  const idx = plans.findIndex((p) => p.id === pid);
  if (idx < 0) return;
  const j = direction === "up" ? idx - 1 : idx + 1;
  if (j < 0 || j >= plans.length) return;
  const a = plans[idx];
  const b = plans[j];
  const sa = typeof a.sortOrder === "number" ? a.sortOrder : idx;
  const sb = typeof b.sortOrder === "number" ? b.sortOrder : j;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, COLLECTION, a.id), {
      sortOrder: sb,
      updatedAt: serverTimestamp(),
    } as DocumentData);
    batch.update(doc(db, COLLECTION, b.id), {
      sortOrder: sa,
      updatedAt: serverTimestamp(),
    } as DocumentData);
    await batch.commit();
  } catch (e) {
    rethrowWithMessage(e);
  }
}
