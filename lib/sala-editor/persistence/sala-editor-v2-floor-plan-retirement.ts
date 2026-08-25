import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { stableEditorV2FloorPlanId } from "@/lib/sala-editor/persistence/sala-editor-v2-publication-core";

type RetiringFloorPlan = {
  id: string;
  name: string;
};

type RetiringTable = {
  id: string;
  floorPlanId: string;
  data: Record<string, unknown>;
};

export type SalaEditorV2RetirementPlan = {
  floorPlans: RetiringFloorPlan[];
};

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasPositiveCount(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasMeaningfulOperationalSignal(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function isOperationalTableSafeToRetire(data: Record<string, unknown>): boolean {
  const type = stringOrEmpty(data.type) || "table";
  if (type !== "table") return true;
  const status = stringOrEmpty(data.status).toLowerCase();
  if (status !== "" && status !== "free") return false;
  return !(
    hasMeaningfulOperationalSignal(data.orders) ||
    hasMeaningfulOperationalSignal(data.orderId) ||
    hasMeaningfulOperationalSignal(data.activeOrderId) ||
    hasMeaningfulOperationalSignal(data.payment) ||
    hasMeaningfulOperationalSignal(data.paymentId) ||
    hasMeaningfulOperationalSignal(data.reservationId) ||
    hasMeaningfulOperationalSignal(data.groupId) ||
    hasMeaningfulOperationalSignal(data.tableGroupId) ||
    hasPositiveCount(data.dinersCount) ||
    hasPositiveCount(data.guestCount) ||
    data.occupied === true
  );
}

function expectedFloorPlanIds(
  restaurantId: string,
  document: SalaEditorDocument,
): Set<string> {
  return new Set(
    document.espacios.map((space) => {
      const linked = stringOrEmpty(space.legacyFloorPlanId);
      return linked || stableEditorV2FloorPlanId(restaurantId, space.id);
    }),
  );
}

async function getRetiringTables(
  restaurantId: string,
  retiringFloorPlanIds: ReadonlySet<string>,
): Promise<RetiringTable[]> {
  if (retiringFloorPlanIds.size === 0) return [];
  const snap = await getDocs(
    query(collection(db, "tables"), where("restaurantId", "==", restaurantId)),
  );
  return snap.docs
    .map((entry) => ({
      id: entry.id,
      floorPlanId: stringOrEmpty(entry.data().floorPlanId),
      data: entry.data() as Record<string, unknown>,
    }))
    .filter((entry) => retiringFloorPlanIds.has(entry.floorPlanId));
}

export async function prepareSalaEditorV2Retirement(params: {
  restaurantId: string;
  document: SalaEditorDocument;
}): Promise<SalaEditorV2RetirementPlan> {
  if (!isFirebaseConfigured) return { floorPlans: [] };
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId || params.document.restaurantId !== restaurantId) {
    throw new Error("sala-editor-retirement: restaurantId no coincide");
  }

  const expected = expectedFloorPlanIds(restaurantId, params.document);
  const floorPlanSnap = await getDocs(
    query(collection(db, "floorPlans"), where("restaurantId", "==", restaurantId)),
  );
  const floorPlans = floorPlanSnap.docs
    .map((entry) => {
      const data = entry.data() as Record<string, unknown>;
      const managedByEditorV2 =
        stringOrEmpty(data.source) === "editor-v2" ||
        stringOrEmpty(data.editorV2SpaceId) !== "";
      return {
        id: entry.id,
        name: stringOrEmpty(data.name) || entry.id,
        restaurantId: stringOrEmpty(data.restaurantId),
        active: data.active !== false,
        managedByEditorV2,
      };
    })
    .filter(
      (plan) =>
        plan.restaurantId === restaurantId &&
        plan.active &&
        plan.managedByEditorV2 &&
        !expected.has(plan.id),
    )
    .map(({ id, name }) => ({ id, name }));

  if (floorPlans.length === 0) return { floorPlans: [] };

  const retiringIds = new Set(floorPlans.map((plan) => plan.id));
  const tables = await getRetiringTables(restaurantId, retiringIds);
  const blockers = tables.filter(
    (table) => table.data.isActive !== false && !isOperationalTableSafeToRetire(table.data),
  );
  if (blockers.length > 0) {
    const names = blockers
      .slice(0, 5)
      .map((table) => stringOrEmpty(table.data.name) || table.id)
      .join(", ");
    throw new Error(
      `No se puede retirar el mapa del TPV porque tiene mesas con actividad: ${names}. Cierra comandas, reservas o agrupaciones activas antes de publicar la eliminación.`,
    );
  }

  return { floorPlans };
}

export async function commitSalaEditorV2Retirement(params: {
  restaurantId: string;
  plan: SalaEditorV2RetirementPlan;
}): Promise<{ floorPlansRetired: number; tablesRetired: number }> {
  if (!isFirebaseConfigured || params.plan.floorPlans.length === 0) {
    return { floorPlansRetired: 0, tablesRetired: 0 };
  }
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId) throw new Error("sala-editor-retirement: restaurantId no disponible");

  const retiringIds = new Set(params.plan.floorPlans.map((plan) => plan.id));
  const tables = await getRetiringTables(restaurantId, retiringIds);
  const blockers = tables.filter(
    (table) => table.data.isActive !== false && !isOperationalTableSafeToRetire(table.data),
  );
  if (blockers.length > 0) {
    throw new Error(
      "El mapa no se ha retirado porque una mesa recibió actividad durante la publicación. Vuelve a intentarlo cuando el servicio de ese mapa esté cerrado.",
    );
  }

  const batch = writeBatch(db);
  let tablesRetired = 0;
  for (const table of tables) {
    if (stringOrEmpty(table.data.restaurantId) !== restaurantId || table.data.isActive === false) {
      continue;
    }
    batch.update(doc(db, "tables", table.id), {
      restaurantId,
      isActive: false,
      updatedAt: serverTimestamp(),
    } as DocumentData);
    tablesRetired += 1;
  }

  for (const floorPlan of params.plan.floorPlans) {
    batch.update(doc(db, "floorPlans", floorPlan.id), {
      restaurantId,
      active: false,
      showInTpv: false,
      updatedAt: serverTimestamp(),
    } as DocumentData);
  }

  await batch.commit();
  return {
    floorPlansRetired: params.plan.floorPlans.length,
    tablesRetired,
  };
}
