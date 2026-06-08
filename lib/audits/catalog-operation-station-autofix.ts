/**
 * Autofix seguro: asigna operationStationId según station canónica.
 * Solo productos activos con station clara y sin operationStationId.
 */

import {
  parseCatalogAuditProduct,
  type CatalogAuditOperationStation,
  type CatalogAuditProduct,
} from "@/lib/audits/catalog-integrity-audit";
import { DEFAULT_OPERATION_STATION_SPECS } from "@/lib/operacion/operation-station-types";
import type { OperationStationType } from "@/lib/operacion/operation-station-types";
import type { OrderLineStation } from "@/lib/kds/order-line-station";

export type OperationStationAutofixPatch = {
  operationStationId: string;
  operationStationName: string;
  operationStationType: OperationStationType;
};

const STATION_AUTOFIX_DEFAULTS: Record<
  Exclude<OrderLineStation, "none">,
  OperationStationAutofixPatch
> = {
  kitchen: {
    operationStationId: "default-kitchen",
    operationStationName: "Cocina",
    operationStationType: "kitchen",
  },
  bar: {
    operationStationId: "default-bar",
    operationStationName: "Barra",
    operationStationType: "bar",
  },
  cocktail: {
    operationStationId: "default-cocktail",
    operationStationName: "Coctelería",
    operationStationType: "cocktail",
  },
};

export type OperationStationAutofixCandidate = {
  productId: string;
  productName: string;
  active: boolean;
  resolvedStation: Exclude<OrderLineStation, "none">;
  before: {
    station: string | null;
    preparationArea: string | null;
    operationStationId: string | null;
    operationStationName: string | null;
    operationStationType: OperationStationType | null;
  };
  after: OperationStationAutofixPatch;
};

export type OperationStationAutofixPlan = {
  restaurantId: string;
  restaurantLabel?: string;
  eligible: OperationStationAutofixCandidate[];
  skipped: Array<{
    productId: string;
    productName: string;
    reason: string;
  }>;
  totalsByStation: Record<Exclude<OrderLineStation, "none">, number>;
};

function loadEnvFromDotLocal(): void {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const envPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {
    // CLI opcional
  }
}

function readTrimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function planOperationStationAutofix(input: {
  products: readonly CatalogAuditProduct[];
  operationStations: readonly CatalogAuditOperationStation[];
}): Omit<OperationStationAutofixPlan, "restaurantId" | "restaurantLabel"> {
  const opIds = new Set(input.operationStations.map((s) => s.id));
  const eligible: OperationStationAutofixCandidate[] = [];
  const skipped: OperationStationAutofixPlan["skipped"] = [];

  const totalsByStation: Record<Exclude<OrderLineStation, "none">, number> = {
    kitchen: 0,
    bar: 0,
    cocktail: 0,
  };

  for (const product of input.products) {
    if (!product.active) {
      skipped.push({
        productId: product.id,
        productName: product.name,
        reason: "inactive",
      });
      continue;
    }

    if (product.operationStationId?.trim()) {
      skipped.push({
        productId: product.id,
        productName: product.name,
        reason: "already_has_operationStationId",
      });
      continue;
    }

    const st = product.resolvedStation;
    if (!st || st === "none") {
      skipped.push({
        productId: product.id,
        productName: product.name,
        reason: "missing_station",
      });
      continue;
    }

    const patch = STATION_AUTOFIX_DEFAULTS[st];
    if (!opIds.has(patch.operationStationId)) {
      skipped.push({
        productId: product.id,
        productName: product.name,
        reason: `operation_station_not_configured:${patch.operationStationId}`,
      });
      continue;
    }

    eligible.push({
      productId: product.id,
      productName: product.name,
      active: product.active,
      resolvedStation: st,
      before: {
        station: product.station,
        preparationArea: product.preparationArea,
        operationStationId: product.operationStationId,
        operationStationName: product.operationStationName,
        operationStationType: product.operationStationType,
      },
      after: patch,
    });
    totalsByStation[st] += 1;
  }

  return { eligible, skipped, totalsByStation };
}

export type OperationStationAutofixApplyResult = {
  dryRun: boolean;
  plan: OperationStationAutofixPlan;
  updatedCount: number;
  updatedProductIds: string[];
};

export async function runOperationStationAutofixFromFirestoreAdmin(
  restaurantId: string,
  options?: { dryRun?: boolean },
): Promise<OperationStationAutofixApplyResult> {
  const dryRun = options?.dryRun !== false;
  loadEnvFromDotLocal();

  const { getHostlyFirestore } = await import("@/lib/firebase/admin");
  const db = getHostlyFirestore();
  if (!db) {
    throw new Error("Firestore Admin no configurado");
  }

  const rid = restaurantId.trim();
  const [prodSnap, opSnap, restSnap] = await Promise.all([
    db.collection("restaurants").doc(rid).collection("products").get(),
    db.collection("restaurants").doc(rid).collection("operationStations").get(),
    db.collection("restaurants").doc(rid).get(),
  ]);

  const restData = restSnap.data() as Record<string, unknown> | undefined;
  const restaurantLabel =
    readTrimmed(restData?.name) ??
    readTrimmed(restData?.nombre) ??
    rid;

  const products = prodSnap.docs.map((d) =>
    parseCatalogAuditProduct(d.id, d.data() as Record<string, unknown>),
  );

  const operationStations: CatalogAuditOperationStation[] = opSnap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      const type = data.type;
      if (type !== "kitchen" && type !== "bar" && type !== "cocktail" && type !== "floor" && type !== "custom") {
        return null;
      }
      return {
        id: d.id,
        name: readTrimmed(data.name) ?? d.id,
        type,
        active: data.active !== false,
      };
    })
    .filter((s): s is CatalogAuditOperationStation => s != null);

  // Si no hay estaciones en Firestore, no escribir (regla de seguridad).
  if (operationStations.length === 0) {
    const plan: OperationStationAutofixPlan = {
      restaurantId: rid,
      restaurantLabel,
      eligible: [],
      skipped: products.map((p) => ({
        productId: p.id,
        productName: p.name,
        reason: "no_operation_stations_in_restaurant",
      })),
      totalsByStation: { kitchen: 0, bar: 0, cocktail: 0 },
    };
    return { dryRun, plan, updatedCount: 0, updatedProductIds: [] };
  }

  const partial = planOperationStationAutofix({ products, operationStations });
  const plan: OperationStationAutofixPlan = {
    restaurantId: rid,
    restaurantLabel,
    ...partial,
  };

  if (dryRun || plan.eligible.length === 0) {
    return {
      dryRun,
      plan,
      updatedCount: 0,
      updatedProductIds: [],
    };
  }

  const now = Date.now();
  const updatedProductIds: string[] = [];

  for (const candidate of plan.eligible) {
    const ref = db
      .collection("restaurants")
      .doc(rid)
      .collection("products")
      .doc(candidate.productId);
    await ref.update({
      operationStationId: candidate.after.operationStationId,
      operationStationName: candidate.after.operationStationName,
      operationStationType: candidate.after.operationStationType,
      updatedAt: now,
    });
    updatedProductIds.push(candidate.productId);
  }

  return {
    dryRun: false,
    plan,
    updatedCount: updatedProductIds.length,
    updatedProductIds,
  };
}

/** Referencia de ids por defecto (documentación / tests). */
export const DEFAULT_OPERATION_STATION_IDS = DEFAULT_OPERATION_STATION_SPECS.map(
  (s) => s.id,
);
