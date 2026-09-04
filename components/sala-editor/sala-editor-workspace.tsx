"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaWallAttachmentKind } from "@/lib/sala-editor/types/wall-attachment";
import type { SurfaceObjectDraft } from "@/lib/sala-editor/surface/surface-object";
import type { SalaEspacioType } from "@/lib/sala-editor/catalog/espacio-types";
import {
  createLocalEspacio,
  nextEspacioSortOrder,
} from "@/lib/sala-editor/preview/create-preview-espacios";
import { useSalaEditorDocument } from "@/hooks/useSalaEditorDocument";
import { useSalaEditorHistory } from "@/hooks/useSalaEditorHistory";
import { useSalaWallDrawing } from "@/hooks/useSalaWallDrawing";
import { useOperationalElementDragging } from "@/hooks/useOperationalElementDragging";
import { useOperationalElementResizing } from "@/hooks/useOperationalElementResizing";
import {
  getDefaultOperationalInstanceCanvasSize,
  getOperationalInstanceCanvasSize,
} from "@/lib/sala-editor/canvas/operational-instance-layout";
import {
  isOperationalBarElementType,
  isOperationalServiceAreaElementType,
  type OperationalElementPosition,
} from "@/lib/sala-editor/ose/operational-element";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { autoCorrectDuplicateOperationalTableNames } from "@/lib/sala-editor/ose/operational-element-naming";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import { getLandscapeToolboxItem } from "@/lib/sala-editor/catalog/landscape-toolbox";
import {
  snapOperationalCenterPosition,
} from "@/lib/sala-editor/canvas/operational-snap";
import {
  SNAP_DISTANCE_PX,
  snapRectToPeers,
  type SnapGuide,
  type SnapRect,
} from "@/lib/sala-editor/snap";
import type { OperationalInstancePointerPayload } from "@/lib/sala-editor/canvas/pointer-interaction";
import type {
  WallEditMode,
  WallEditOutcome,
} from "@/lib/sala-editor/canvas/wall-interaction";
import type { WallAttachmentEditOutcome } from "@/lib/sala-editor/canvas/wall-attachment-interaction";
import type { SurfaceEditOutcome } from "@/lib/sala-editor/surface/surface-interaction";
import {
  loadSalaEditorDraft,
  saveSalaEditorDraft,
} from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import {
  getLastSalaEditorV2PublisherFirestoreOperation,
  publishSalaEditorV2Phase1ToLegacy,
  type SalaEditorV2PublicationResult,
} from "@/lib/sala-editor/persistence/sala-editor-v2-publication";
import { loadLegacySalaEditorDocument } from "@/lib/sala-editor/adapters/legacy-adapters";
import { getFloorPlans, type FloorPlan } from "@/lib/firestore/floorPlans";
import { getTables, type Table } from "@/lib/firestore/tables";
import {
  computeSafeLegacyTableAutoLinks,
  isLegacyOperationalTableCandidate,
  readLegacyTableIdFromMetadata,
  shouldOfferLegacyTableAutoLink,
  type LegacyTableAutoLinkReason,
  type LegacyTableAutoLinkResult,
} from "@/lib/sala-editor/linking/legacy-table-linking";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
import type { SalaEditorContextActionTarget } from "@/components/sala-editor/sala-editor-context-action-bar";
import { hasSalaEditorInspectorSelection } from "@/components/sala-editor/sala-editor-inspector-visibility";
import {
  SalaEditorLeftPanel,
  SalaEditorInspectorPanel,
  SalaEditorWorkspaceCanvas,
  SalaAddEspacioDialog,
} from "@/components/sala-editor/panels";

export type SalaEditorWorkspaceProps = {
  restaurantId: string;
  initialEspacios?: SalaEspacio[];
  legacyEditorHref?: string;
  currentUserId?: string | null;
  draftPersistenceEnabled?: boolean;
};

const EMPTY_SMART_SNAP_GUIDES: SnapGuide[] = [];
const SALA_EDITOR_DEV_DIAGNOSTICS = process.env.NODE_ENV !== "production";

function formatSalaEditorPublicationSummary(
  result: SalaEditorV2PublicationResult,
): string {
  const skippedByReason = result.skippedTables.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.reason] = (acc[item.reason] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const skippedZonesByReason = result.skippedZones.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.reason] = (acc[item.reason] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const skippedDecorativesByReason = result.skippedDecorativeTables.reduce<
    Record<string, number>
  >(
    (acc, item) => {
      acc[item.reason] = (acc[item.reason] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const skippedLegacyDecorativesByReason =
    result.skippedLegacyDecorativeTables.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.reason] = (acc[item.reason] ?? 0) + 1;
        return acc;
      },
      {},
    );
  const skippedZoneDetails = Object.entries(skippedZonesByReason).map(
    ([reason, count]) => `${count} zona${count === 1 ? "" : "s"} ${reason}`,
  );
  const skippedDecorativeDetails = Object.entries(skippedDecorativesByReason).map(
    ([reason, count]) =>
      `${count} decorativo${count === 1 ? "" : "s"} ${reason}`,
  );
  const skippedLegacyDecorativeDetails = Object.entries(
    skippedLegacyDecorativesByReason,
  ).map(
    ([reason, count]) =>
      `${count} legacy${count === 1 ? "" : "s"} ${reason}`,
  );
  const details = [
    skippedByReason.missing_legacy_table_id
      ? `${skippedByReason.missing_legacy_table_id} sin enlace`
      : null,
    skippedByReason.legacy_table_not_found
      ? `${skippedByReason.legacy_table_not_found} no encontradas`
      : null,
    skippedByReason.duplicate_legacy_table_id
      ? `${skippedByReason.duplicate_legacy_table_id} duplicadas`
      : null,
    skippedByReason.duplicate_table_number
      ? `${skippedByReason.duplicate_table_number} con numero ya existente`
      : null,
    skippedByReason.unsafe_floor_plan
      ? `${skippedByReason.unsafe_floor_plan} sin plano seguro`
      : null,
    skippedByReason.invalid_name
      ? `${skippedByReason.invalid_name} sin nombre valido`
      : null,
    skippedByReason.restaurant_mismatch
      ? `${skippedByReason.restaurant_mismatch} de otro restaurante`
      : null,
    result.newOperationalTableLinks.length > 0
      ? `${result.newOperationalTableLinks.length} mesa${result.newOperationalTableLinks.length === 1 ? "" : "s"} nuevas enlazadas`
      : null,
    result.unsafeFloorPlanTables.length > 0
      ? `${result.unsafeFloorPlanTables.length} con plano no seguro`
      : null,
    result.zonesUpdated > 0
      ? `${result.zonesUpdated} zona${result.zonesUpdated === 1 ? "" : "s"} publicadas`
      : null,
    result.skippedZones.length > 0
      ? `${result.skippedZones.length} zona${result.skippedZones.length === 1 ? "" : "s"} omitidas`
      : null,
    ...skippedZoneDetails,
    result.decorativeTablesUpdated > 0
      ? `${result.decorativeTablesUpdated} decorativo${result.decorativeTablesUpdated === 1 ? "" : "s"} publicados`
      : null,
    result.decorativeAudit.length > 0
      ? `${result.decorativeAudit.length} decorativo${result.decorativeAudit.length === 1 ? "" : "s"} activos auditados`
      : null,
    result.decorativeLegacyFound > 0
      ? `${result.decorativeLegacyFound} decorativo${result.decorativeLegacyFound === 1 ? "" : "s"} legacy encontrados`
      : null,
    result.decorativeLegacyDeactivated > 0
      ? `${result.decorativeLegacyDeactivated} decorativo${result.decorativeLegacyDeactivated === 1 ? "" : "s"} legacy desactivados`
      : null,
    result.skippedDecorativeTables.length > 0
      ? `${result.skippedDecorativeTables.length} decorativo${result.skippedDecorativeTables.length === 1 ? "" : "s"} omitidos`
      : null,
    ...skippedDecorativeDetails,
    result.skippedLegacyDecorativeTables.length > 0
      ? `${result.skippedLegacyDecorativeTables.length} legacy${result.skippedLegacyDecorativeTables.length === 1 ? "" : "s"} omitidos`
      : null,
    ...skippedLegacyDecorativeDetails,
  ].filter(Boolean);

  const suffix = details.length > 0 ? ` · ${details.join(" · ")}` : "";
  return `${result.tablesUpdated} mesa${result.tablesUpdated === 1 ? "" : "s"} publicadas${suffix}`;
}

function logSalaEditorPublicationDebug(result: SalaEditorV2PublicationResult): void {
  if (!SALA_EDITOR_DEV_DIAGNOSTICS || result.decorativeAudit.length === 0) return;
  console.groupCollapsed("[SalaEditorV2] Auditoria publicacion TPV decorativos");
  console.table(
    result.decorativeAudit.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      isActive: item.isActive,
      floorPlanId: item.floorPlanId ?? "",
      source: item.source ?? "",
      editorV2ElementId: item.editorV2ElementId ?? "",
      x: item.x ?? "",
      y: item.y ?? "",
      width: item.width ?? "",
      height: item.height ?? "",
      belongsToPublishedPlan: item.belongsToPublishedPlan,
      action: item.action,
      reason: item.reason,
    })),
  );
  console.groupEnd();
}

function readDebugValue(entry: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (entry[key] !== undefined) return entry[key];
  }
  return undefined;
}

function sampleDocumentCollection(
  items: readonly unknown[],
): Array<Record<string, unknown>> {
  return items.slice(0, 5).map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { value: String(item) };
    }
    const entry = item as Record<string, unknown>;
    return {
      id: readDebugValue(entry, ["id"]),
      type: readDebugValue(entry, ["type", "elementType", "kind", "material", "category"]),
      spaceId: readDebugValue(entry, ["spaceId", "espacioId"]),
      floorPlanId: readDebugValue(entry, ["floorPlanId", "legacyFloorPlanId"]),
      x: readDebugValue(entry, ["x", "x1"]),
      y: readDebugValue(entry, ["y", "y1"]),
      width: readDebugValue(entry, ["width"]),
      height: readDebugValue(entry, ["height"]),
      metadata: readDebugValue(entry, ["metadata"]),
    };
  });
}

function collectDocumentCollectionTypes(items: readonly unknown[]): string[] {
  const types = new Set<string>();
  for (const item of items) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const type = readDebugValue(entry, [
      "type",
      "elementType",
      "kind",
      "material",
      "category",
    ]);
    if (typeof type === "string" && type.trim()) {
      types.add(type.trim());
    }
  }
  return [...types].sort((a, b) => a.localeCompare(b, "es"));
}

type SalaEditorLegacyFloorPlanRepairReason = "space_name";

type SalaEditorLegacyFloorPlanRepairWarning = {
  spaceId: string;
  spaceName: string;
  reason:
    | "no_operational_floor_plans"
    | "duplicate_space_name"
    | "ambiguous_floor_plan_name"
    | "no_floor_plan_name_match";
  candidateFloorPlanIds: string[];
};

type SalaEditorLegacyFloorPlanRepairLink = {
  spaceId: string;
  spaceName: string;
  floorPlanId: string;
  floorPlanName: string;
  reason: SalaEditorLegacyFloorPlanRepairReason;
};

type SalaEditorLegacyFloorPlanRepairResult = {
  document: SalaEditorDocument;
  stats: {
    totalSpaces: number;
    alreadyLinkedSpaces: number;
    repairedSpaces: number;
    unlinkedSpaces: number;
    repairedFloorPlanIds: string[];
    repairedLinks: SalaEditorLegacyFloorPlanRepairLink[];
    repairReasons: Partial<Record<SalaEditorLegacyFloorPlanRepairReason, number>>;
    warnings: SalaEditorLegacyFloorPlanRepairWarning[];
  };
};

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createPersistableDocumentSignature(document: SalaEditorDocument): string {
  const {
    navigation: _navigation,
    updatedAt: _updatedAt,
    ...persistableDocument
  } = document;
  void _navigation;
  void _updatedAt;
  return JSON.stringify(persistableDocument);
}

function normalizeRepairName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

function isSafeLegacyFloorPlan(plan: FloorPlan, restaurantId: string): boolean {
  return (
    plan.restaurantId === restaurantId &&
    plan.active !== false &&
    plan.showInTpv !== false &&
    stringOrEmpty(plan.id) !== ""
  );
}

function logSalaEditorFloorPlanNameAudit(params: {
  document: SalaEditorDocument;
  floorPlans: FloorPlan[];
  restaurantId: string;
}): void {
  const { document, floorPlans, restaurantId } = params;
  const operationalFloorPlans = floorPlans.filter((plan) =>
    isSafeLegacyFloorPlan(plan, restaurantId),
  );

  console.groupCollapsed("[SalaEditorV2] Auditoria nombres espacio-floorPlan");
  console.table(
    document.espacios.map((space) => ({
      id: space.id,
      name: space.name,
      legacyFloorPlanId: space.legacyFloorPlanId ?? "",
      normalizedName: normalizeRepairName(space.name),
    })),
  );
  console.table(
    floorPlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      active: plan.active !== false,
      visible: plan.showInTpv !== false,
      operationalForRepair: isSafeLegacyFloorPlan(plan, restaurantId),
      normalizedName: normalizeRepairName(plan.name),
    })),
  );

  for (const space of document.espacios) {
    const normalizedSpaceName = normalizeRepairName(space.name);
    const normalizedMatches = operationalFloorPlans.filter(
      (plan) => normalizeRepairName(plan.name) === normalizedSpaceName,
    );
    const summary =
      normalizedMatches.length === 0
        ? "sin coincidencias"
        : normalizedMatches.length > 1
          ? "multiples coincidencias"
          : "coincidencia unica por nombre normalizado";

    console.groupCollapsed(`Espacio: "${space.name}"`);
    console.info("[SalaEditorV2] Resultado comparacion nombres", {
      spaceId: space.id,
      legacyFloorPlanId: space.legacyFloorPlanId ?? "",
      normalizedSpaceName,
      result: summary,
      matchedFloorPlanIds: normalizedMatches.map((plan) => plan.id),
    });
    console.table(
      floorPlans.map((plan) => {
        const normalizedFloorPlanName = normalizeRepairName(plan.name);
        const exactMatch = space.name.trim() === plan.name.trim();
        const normalizedMatch = normalizedSpaceName === normalizedFloorPlanName;
        return {
          comparedWith: `"${plan.name}"`,
          floorPlanId: plan.id,
          active: plan.active !== false,
          visible: plan.showInTpv !== false,
          operationalForRepair: isSafeLegacyFloorPlan(plan, restaurantId),
          normalizedFloorPlanName,
          exactMatch,
          normalizedMatch,
          reason: exactMatch
            ? "coincidencia exacta"
            : normalizedMatch
              ? "distinto nombre; coincide tras normalizar"
              : "distinto tras normalizar",
        };
      }),
    );
    console.groupEnd();
  }
  console.groupEnd();
}

function salaEditorSpaceTraceRows(document: SalaEditorDocument) {
  return document.espacios.map((space) => ({
    id: space.id,
    name: space.name,
    legacyFloorPlanId: space.legacyFloorPlanId ?? "",
    active: space.active,
    visible: space.visible,
    tipo: space.tipo,
    sortOrder: space.sortOrder,
  }));
}

function salaEditorSpaceTraceRowsCompact(document: SalaEditorDocument) {
  return document.espacios.map((space) => ({
    id: space.id,
    name: space.name,
    legacyFloorPlanId: space.legacyFloorPlanId ?? "",
  }));
}

function traceReplaceDocumentBefore(params: {
  branch: string;
  restaurantId: string;
  document: SalaEditorDocument;
}): void {
  if (!SALA_EDITOR_DEV_DIAGNOSTICS) return;
  const { branch, restaurantId, document } = params;
  console.warn("[SalaEditorV2] TRACE replaceDocument BEFORE", {
    branch,
    restaurantId,
    documentId: (document as unknown as { id?: string }).id ?? null,
    activeSpaceId: document.navigation.selectedEspacioId,
    spacesCount: document.espacios.length,
  });
  console.table(salaEditorSpaceTraceRows(document));
}

function traceBeforePublisherSpaces(document: SalaEditorDocument): void {
  if (!SALA_EDITOR_DEV_DIAGNOSTICS) return;
  const selectedSpaceId = document.navigation.selectedEspacioId;
  const selectedSpace =
    document.espacios.find((space) => space.id === selectedSpaceId) ?? null;
  console.warn("[SalaEditorV2] TRACE before publisher spaces", {
    activeSpaceId: document.navigation.selectedEspacioId,
    selectedSpaceId,
    selectedSpaceLegacyFloorPlanId: selectedSpace?.legacyFloorPlanId ?? null,
  });
  console.table(salaEditorSpaceTraceRows(document));
}

function repairSalaEditorLegacyFloorPlanLinks(
  document: SalaEditorDocument,
  restaurantId: string,
  legacy: {
    floorPlans: FloorPlan[];
  },
): SalaEditorLegacyFloorPlanRepairResult {
  const rid = restaurantId.trim();
  const operationalFloorPlans = legacy.floorPlans.filter((plan) =>
    isSafeLegacyFloorPlan(plan, rid),
  );
  const floorPlansByName = operationalFloorPlans.reduce<Map<string, FloorPlan[]>>(
    (acc, plan) => {
      const key = normalizeRepairName(plan.name);
      const list = acc.get(key) ?? [];
      list.push(plan);
      acc.set(key, list);
      return acc;
    },
    new Map(),
  );
  const spaceNameCounts = document.espacios.reduce<Map<string, number>>((acc, space) => {
    const key = normalizeRepairName(space.name);
    acc.set(key, (acc.get(key) ?? 0) + 1);
    return acc;
  }, new Map());

  let alreadyLinkedSpaces = 0;
  let repairedSpaces = 0;
  const repairedFloorPlanIds = new Set<string>();
  const repairedLinks: SalaEditorLegacyFloorPlanRepairLink[] = [];
  const repairReasons: Partial<Record<SalaEditorLegacyFloorPlanRepairReason, number>> = {};
  const warnings: SalaEditorLegacyFloorPlanRepairWarning[] = [];

  const espacios = document.espacios.map((space) => {
    if (stringOrEmpty(space.legacyFloorPlanId)) {
      alreadyLinkedSpaces += 1;
      return space;
    }

    const normalizedSpaceName = normalizeRepairName(space.name);
    if (normalizedSpaceName === "") {
      warnings.push({
        spaceId: space.id,
        spaceName: space.name,
        reason: "no_floor_plan_name_match",
        candidateFloorPlanIds: [],
      });
      return space;
    }

    const matches = floorPlansByName.get(normalizedSpaceName) ?? [];
    const hasDuplicateSpaceName = (spaceNameCounts.get(normalizedSpaceName) ?? 0) > 1;
    if (hasDuplicateSpaceName) {
      warnings.push({
        spaceId: space.id,
        spaceName: space.name,
        reason: "duplicate_space_name",
        candidateFloorPlanIds: matches.map((plan) => plan.id),
      });
      return space;
    }

    if (matches.length === 1) {
      const floorPlan = matches[0]!;
      repairedSpaces += 1;
      repairedFloorPlanIds.add(floorPlan.id);
      repairedLinks.push({
        spaceId: space.id,
        spaceName: space.name,
        floorPlanId: floorPlan.id,
        floorPlanName: floorPlan.name,
        reason: "space_name",
      });
      repairReasons.space_name = (repairReasons.space_name ?? 0) + 1;
      return {
        ...space,
        legacyFloorPlanId: floorPlan.id,
      };
    }

    warnings.push({
      spaceId: space.id,
      spaceName: space.name,
      reason:
        operationalFloorPlans.length === 0
          ? "no_operational_floor_plans"
          : matches.length > 1
            ? "ambiguous_floor_plan_name"
            : "no_floor_plan_name_match",
      candidateFloorPlanIds: matches.map((plan) => plan.id),
    });
    return space;
  });

  const repairedDocument =
    repairedSpaces > 0
      ? {
          ...document,
          espacios,
          updatedAt: Date.now(),
        }
      : document;

  return {
    document: repairedDocument,
    stats: {
      totalSpaces: document.espacios.length,
      alreadyLinkedSpaces,
      repairedSpaces,
      unlinkedSpaces: document.espacios.length - alreadyLinkedSpaces - repairedSpaces,
      repairedFloorPlanIds: [...repairedFloorPlanIds],
      repairedLinks,
      repairReasons,
      warnings,
    },
  };
}

function logSalaEditorLegacyFloorPlanRepair(
  result: SalaEditorLegacyFloorPlanRepairResult,
): void {
  const { stats } = result;
  const repairedBySpaceId = new Map(
    stats.repairedLinks.map((link) => [link.spaceId, link]),
  );
  const warningBySpaceId = new Map(
    stats.warnings.map((warning) => [warning.spaceId, warning]),
  );
  console.info("[SalaEditorV2] Reparacion legacyFloorPlanId en draft", {
    espaciosTotales: stats.totalSpaces,
    espaciosYaEnlazados: stats.alreadyLinkedSpaces,
    espaciosReparados: stats.repairedSpaces,
    espaciosSinEnlace: stats.unlinkedSpaces,
    floorPlanIdsUsados: stats.repairedFloorPlanIds,
    enlacesReparados: stats.repairedLinks.map((link) => ({
      spaceId: link.spaceId,
      spaceName: link.spaceName,
      floorPlanId: link.floorPlanId,
      floorPlanName: link.floorPlanName,
      reason: link.reason,
    })),
    motivosReparacion: stats.repairReasons,
    motivosSinReparar: stats.warnings.map((warning) => ({
      spaceId: warning.spaceId,
      spaceName: warning.spaceName,
      reason: warning.reason,
      candidateFloorPlanIds: warning.candidateFloorPlanIds,
    })),
  });
  console.table(
    result.document.espacios.map((space) => {
      const repaired = repairedBySpaceId.get(space.id);
      const warning = warningBySpaceId.get(space.id);
      return {
        id: space.id,
        name: space.name,
        legacyFloorPlanId: space.legacyFloorPlanId ?? "",
        repaired: repaired != null,
        status: repaired
          ? "repaired"
          : warning
            ? "unlinked"
            : stringOrEmpty(space.legacyFloorPlanId)
              ? "already_linked"
              : "unlinked",
        reason: repaired?.reason ?? warning?.reason ?? "already_linked",
        matchedFloorPlanName: repaired?.floorPlanName ?? "",
        candidateFloorPlanIds: warning?.candidateFloorPlanIds.join(", ") ?? "",
      };
    }),
  );
  console.info("[SalaEditorV2] legacyFloorPlanId repair applied", {
    espaciosTotales: stats.totalSpaces,
    espaciosReparados: stats.repairedSpaces,
    espaciosSinEnlace: stats.unlinkedSpaces,
  });
  console.table(
    result.document.espacios.map((space) => {
      const repaired = repairedBySpaceId.get(space.id);
      const warning = warningBySpaceId.get(space.id);
      return {
        spaceId: space.id,
        spaceName: space.name,
        normalizedSpaceName: normalizeRepairName(space.name),
        matchedFloorPlanId: repaired?.floorPlanId ?? "",
        matchedFloorPlanName: repaired?.floorPlanName ?? "",
        reason: repaired?.reason ?? warning?.reason ?? "already_linked",
        repaired: repaired != null,
      };
    }),
  );
}

function logSalaEditorDocumentPublicationDebug(document: SalaEditorDocument): void {
  if (!SALA_EDITOR_DEV_DIAGNOSTICS) return;
  const collections: Array<{ name: string; items: readonly unknown[] }> = [
    { name: "espacios", items: document.espacios },
    { name: "operationalElements", items: document.operationalElements },
    {
      name: "operationalElementInstances",
      items: document.operationalElementInstances,
    },
    { name: "surfaceObjects", items: document.surfaceObjects },
    { name: "structuralElements", items: document.structuralElements },
    { name: "walls", items: document.walls },
    { name: "wallAttachments", items: document.wallAttachments },
    { name: "landscapeElements", items: document.landscapeElements },
    { name: "zones", items: document.zones },
  ];
  const knownKeys = new Set([
    "version",
    "restaurantId",
    "espacios",
    "walls",
    "wallAttachments",
    "surfaceObjects",
    "zones",
    "structuralElements",
    "landscapeElements",
    "operationalElements",
    "operationalElementInstances",
    "navigation",
    "updatedAt",
  ]);
  const extraCollectionKeys = Object.entries(document as unknown as Record<string, unknown>)
    .filter(([key, value]) => !knownKeys.has(key) && Array.isArray(value))
    .map(([key, value]) => ({ name: key, items: value as unknown[] }));

  console.groupCollapsed("[SalaEditorV2] Documento V2 antes de publicar");
  console.info("[SalaEditorV2] Documento V2 resumen", {
    documentId: (document as unknown as { id?: string }).id ?? null,
    restaurantId: document.restaurantId,
    activeSpaceId: document.navigation.selectedEspacioId,
    phase: document.navigation.phase,
    updatedAt: document.updatedAt,
    espacios: document.espacios.length,
    operationalElements: document.operationalElements.length,
    operationalElementInstances: document.operationalElementInstances.length,
    surfaceObjects: document.surfaceObjects.length,
    structuralElements: document.structuralElements.length,
    walls: document.walls.length,
    wallAttachments: document.wallAttachments.length,
    landscapeElements: document.landscapeElements.length,
    zones: document.zones.length,
    extraCollections: extraCollectionKeys.map((entry) => entry.name),
  });
  console.table(
    document.espacios.map((space) => ({
      id: space.id,
      name: space.name,
      legacyFloorPlanId: space.legacyFloorPlanId ?? "",
      selected: space.id === document.navigation.selectedEspacioId,
      active: space.active,
      visible: space.visible,
    })),
  );
  console.table(
    [...collections, ...extraCollectionKeys].map((entry) => ({
      collection: entry.name,
      count: entry.items.length,
      types: collectDocumentCollectionTypes(entry.items).join(", "),
    })),
  );
  for (const entry of [...collections, ...extraCollectionKeys]) {
    if (entry.items.length === 0) continue;
    console.groupCollapsed(`[SalaEditorV2] ${entry.name} primeros 5`);
    console.table(sampleDocumentCollection(entry.items));
    console.groupEnd();
  }
  console.groupEnd();
}

const AUTO_LINK_REASON_LABELS: Record<LegacyTableAutoLinkReason, string> = {
  LINKED: "enlazadas automáticamente",
  SIN_COINCIDENCIA_NUMERO: "sin coincidencia por número",
  SIN_COINCIDENCIA_NOMBRE: "sin coincidencia por nombre",
  NUMERO_DUPLICADO: "número duplicado",
  NOMBRE_DUPLICADO: "nombre duplicado",
  LEGACY_OCUPADA: "legacy ocupada",
  LEGACY_YA_ENLAZADA: "legacy ya enlazada",
  LEGACY_NO_EXISTE: "legacy no existe o inactiva",
  ENTIDAD_NO_OPERATIVA: "entidad no operativa",
  RESTAURANT_DISTINTO: "de otro restaurante",
  SIN_NUMERO: "sin número",
  SIN_NOMBRE: "sin nombre",
  OTRA_CAUSA: "otra causa",
};

function formatSalaEditorAutoLinkSummary(result: LegacyTableAutoLinkResult): string {
  const details = Object.entries(result.reasonCounts)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([reason, count]) => {
      const label = AUTO_LINK_REASON_LABELS[reason as LegacyTableAutoLinkReason] ?? reason;
      return `${count} ${label}`;
    });
  const suffix = details.length > 0 ? ` · ${details.join(" · ")}` : "";
  return `${result.analyzedCount} mesa${result.analyzedCount === 1 ? "" : "s"} analizadas${suffix}`;
}

function logSalaEditorAutoLinkDebug(result: LegacyTableAutoLinkResult): void {
  console.groupCollapsed("[SalaEditorV2] Auditoria auto-linking mesas");
  console.table(
    result.debug.map((entry) => ({
      mesaV2Id: entry.instanceId,
      mesaV2Nombre: entry.instanceName,
      mesaV2Numero: entry.instanceNumber ?? "",
      resultado: entry.result,
      motivo: entry.reason,
      legacyTableId: entry.legacyTableId ?? "",
      candidatasLegacy: entry.candidatesFound,
    })),
  );
  for (const entry of result.debug) {
    console.groupCollapsed(
      `[SalaEditorV2] ${entry.instanceName || entry.instanceId} -> ${entry.reason}`,
    );
    console.table(
      entry.candidates.map((candidate) => ({
        legacyId: candidate.id,
        nombre: candidate.name,
        numero: candidate.number ?? "",
        restaurantId: candidate.restaurantId,
        status: candidate.status,
        activa: candidate.isActive,
        yaEnlazada: candidate.alreadyLinked,
        descartada: candidate.discarded,
        motivoDescarte: candidate.discardReason ?? "",
      })),
    );
    console.groupEnd();
  }
  console.groupEnd();
}

function operationalInstanceToSnapRect(
  instance: OperationalElementInstance,
): SnapRect {
  const size = getOperationalInstanceCanvasSize(instance);
  return {
    id: instance.id,
    x: instance.position.x - size.width / 2,
    y: instance.position.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function isOperationalSmartSnapType(
  instance: OperationalElementInstance,
): boolean {
  return (
    instance.elementType === "TABLE" ||
    isOperationalBarElementType(instance.elementType) ||
    isOperationalServiceAreaElementType(instance.elementType)
  );
}

function operationalPositionToSnapRect(
  instance: OperationalElementInstance,
  position: OperationalElementPosition,
): SnapRect {
  const size = getOperationalInstanceCanvasSize(instance);
  return {
    id: instance.id,
    x: position.x - size.width / 2,
    y: position.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function snapRectToOperationalPosition(rect: SnapRect): OperationalElementPosition {
  return {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
}

/**
 * Workspace del editor de sala V2.
 * Estado 100 % local; gestor visual + herramienta activa + paredes (Fase 2.3).
 */
export function SalaEditorWorkspace({
  restaurantId,
  initialEspacios = [],
  legacyEditorHref,
  currentUserId = null,
  draftPersistenceEnabled = true,
}: SalaEditorWorkspaceProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [operationalSnapGuides, setOperationalSnapGuides] =
    useState<SnapGuide[]>(EMPTY_SMART_SNAP_GUIDES);
  const [draftReady, setDraftReady] = useState(!draftPersistenceEnabled);
  const [draftLoadBlocked, setDraftLoadBlocked] = useState(false);
  const [legacyHydratedReadOnly, setLegacyHydratedReadOnly] = useState(false);
  const [publishToTpvPending, setPublishToTpvPending] = useState(false);
  const [autoLinkTablesPending, setAutoLinkTablesPending] = useState(false);
  const [publishToTpvStatus, setPublishToTpvStatus] = useState<string | null>(null);
  const [legacyTablesForLinking, setLegacyTablesForLinking] = useState<Table[]>([]);
  const [legacyFloorPlansForLinking, setLegacyFloorPlansForLinking] = useState<FloorPlan[]>([]);
  const draftLoadSeqRef = useRef(0);
  const currentUserIdRef = useRef(currentUserId);
  const lastDraftSignatureRef = useRef<string | null>(null);
  const legacyHydrationBaselineRef = useRef<{
    restaurantId: string;
    signature: string;
  } | null>(null);
  const documentSnapshotRef = useRef<SalaEditorDocument | null>(null);
  const knownOperationalInstanceIdsRef = useRef<Set<string>>(new Set());
  const knownOperationalInstanceIdsReadyRef = useRef(false);
  const lastOperationalNameCorrectionIdRef = useRef<string | null>(null);

  const { historyApi } = useSalaEditorHistory();

  const getDocumentSnapshot = useCallback(() => {
    return documentSnapshotRef.current!;
  }, []);

  const traceReplaceDocumentAfter = useCallback((branch: string) => {
    if (!SALA_EDITOR_DEV_DIAGNOSTICS) return;
    window.setTimeout(() => {
      const snapshot = documentSnapshotRef.current;
      console.warn("[SalaEditorV2] TRACE replaceDocument AFTER", {
        branch,
        activeSpaceId: snapshot?.navigation.selectedEspacioId ?? null,
        spacesCount: snapshot?.espacios.length ?? 0,
      });
      if (snapshot) {
        console.table(salaEditorSpaceTraceRowsCompact(snapshot));
      }
    }, 0);
  }, []);

  const {
    document,
    disabledPhases,
    selectedEspacio,
    elementCountByEspacioId,
    activeStructuralToolKind,
    activeStructuralToolboxItem,
    activeSurfaceMaterial,
    activeZoneType,
    activeLandscapeKind,
    surfaceObjectsInEspacio,
    selectedSurfaceObjectId,
    zonesInEspacio,
    selectedZoneId,
    selectedZone,
    structuralElementsInEspacio,
    selectedStructuralElementId,
    selectedStructuralElement,
    landscapeElementsInEspacio,
    selectedLandscapeElementId,
    selectedLandscapeElement,
    activeOperationalElementType,
    activeOperationalVisualVariant,
    activeOperationalCatalogItem,
    operationalElementInstancesInEspacio,
    selectedOperationalElementInstanceId,
    selectedOperationalElementInstance,
    selectedWallAttachmentId,
    replaceDocument,
    restoreDocumentSnapshot,
    selectTool,
    selectSurfaceMaterial,
    selectZoneType,
    selectLandscapeKind,
    addSurfaceObject,
    updateSurfaceObject,
    removeSurfaceObject,
    selectSurfaceObject,
    clearSurfaceSelection,
    addZone,
    updateZone,
    removeZone,
    selectZone,
    clearZoneSelection,
    addStructuralElement,
    updateStructuralElement,
    removeStructuralElement,
    selectStructuralElement,
    clearStructuralElementSelection,
    addLandscapeElement,
    updateLandscapeElement,
    removeLandscapeElement,
    selectLandscapeElement,
    clearLandscapeSelection,
    selectOperationalElement,
    clearOperationalElement,
    placeOperationalElementAt,
    selectOperationalElementInstance,
    clearOperationalElementInstance,
    updateOperationalElement,
    removeOperationalElement,
    duplicateOperationalElement,
    resizeOperationalElementInstance,
    setPhase,
    selectEspacio,
    addEspacioAndSelect,
    duplicateEspacio,
    reorderEspacios,
    updateEspacio,
    updateEspacioBase,
    addWall,
    updateWall,
    removeWall,
    addWallAttachment,
    selectWallAttachment,
    clearWallAttachmentSelection,
    updateWallAttachment,
    removeWallAttachment,
  } = useSalaEditorDocument({
    restaurantId,
    initialEspacios,
    historyApi,
    getDocumentSnapshot,
  });
  const initialLocalDocumentRef = useRef(document);
  documentSnapshotRef.current = document;

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    knownOperationalInstanceIdsRef.current = new Set();
    knownOperationalInstanceIdsReadyRef.current = false;
  }, [restaurantId]);

  useEffect(() => {
    if (!draftPersistenceEnabled) {
      setDraftReady(true);
      return;
    }

    const requestId = ++draftLoadSeqRef.current;
    setDraftReady(false);
    setDraftLoadBlocked(false);

    void (async () => {
      try {
        const draft = await loadSalaEditorDraft(restaurantId);
        if (requestId !== draftLoadSeqRef.current) return;

        if (draft) {
          legacyHydrationBaselineRef.current = null;
          let documentToLoad = draft.document;
          let lastPersistedSignature = JSON.stringify(draft.document);
          try {
            const rid = restaurantId.trim();
            const floorPlans = await getFloorPlans(rid);
            if (requestId !== draftLoadSeqRef.current) return;

            logSalaEditorFloorPlanNameAudit({
              document: draft.document,
              floorPlans,
              restaurantId: rid,
            });
            const repair = repairSalaEditorLegacyFloorPlanLinks(
              draft.document,
              rid,
              { floorPlans },
            );
            logSalaEditorLegacyFloorPlanRepair(repair);
            documentToLoad = repair.document;
            if (repair.stats.repairedSpaces > 0) {
              try {
                await saveSalaEditorDraft(rid, repair.document, {
                  updatedBy: currentUserIdRef.current,
                });
                lastPersistedSignature = JSON.stringify(repair.document);
                console.info("[SalaEditorV2] legacyFloorPlanId repair persisted", {
                  restaurantId: rid,
                  espaciosReparados: repair.stats.repairedSpaces,
                  floorPlanIdsUsados: repair.stats.repairedFloorPlanIds,
                });
              } catch (saveError) {
                console.warn(
                  "[SalaEditorV2] No se pudo persistir reparacion legacyFloorPlanId; autosave intentara guardar el documento reparado",
                  saveError,
                );
              }
            } else {
              lastPersistedSignature = JSON.stringify(repair.document);
            }
          } catch (error) {
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "[SalaEditorV2] No se pudo reparar legacyFloorPlanId del draft",
                error,
              );
            }
          }

          traceReplaceDocumentBefore({
            branch: "draft_loaded",
            restaurantId,
            document: documentToLoad,
          });
          replaceDocument(documentToLoad);
          traceReplaceDocumentAfter("draft_loaded");
          lastDraftSignatureRef.current = lastPersistedSignature;
          setLegacyHydratedReadOnly(false);
        } else {
          const legacyHydration = await loadLegacySalaEditorDocument(restaurantId);
          if (requestId !== draftLoadSeqRef.current) return;

          if (legacyHydration) {
            legacyHydrationBaselineRef.current = {
              restaurantId: restaurantId.trim(),
              signature: createPersistableDocumentSignature(legacyHydration.document),
            };
            traceReplaceDocumentBefore({
              branch: "legacy_hydration",
              restaurantId,
              document: legacyHydration.document,
            });
            replaceDocument(legacyHydration.document);
            traceReplaceDocumentAfter("legacy_hydration");
            lastDraftSignatureRef.current = JSON.stringify(legacyHydration.document);
            setLegacyHydratedReadOnly(true);
            if (
              process.env.NODE_ENV === "development" &&
              legacyHydration.warnings.length > 0
            ) {
              console.warn(
                "[SalaEditorV2] Hidratación legacy con avisos",
                legacyHydration.warnings,
              );
            }
          } else {
            legacyHydrationBaselineRef.current = null;
            lastDraftSignatureRef.current = JSON.stringify(
              initialLocalDocumentRef.current,
            );
            setLegacyHydratedReadOnly(false);
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[SalaEditorV2] No se pudo cargar el borrador", error);
        }
        if (requestId !== draftLoadSeqRef.current) return;
        legacyHydrationBaselineRef.current = null;
        lastDraftSignatureRef.current = null;
        setLegacyHydratedReadOnly(true);
        setDraftLoadBlocked(true);
        setPublishToTpvStatus(
          "No se pudo cargar el borrador. El guardado automático y la publicación están bloqueados para proteger los datos existentes.",
        );
      } finally {
        if (requestId === draftLoadSeqRef.current) {
          setDraftReady(true);
        }
      }
    })();
  }, [
    draftPersistenceEnabled,
    replaceDocument,
    restaurantId,
    traceReplaceDocumentAfter,
  ]);

  useEffect(() => {
    if (!draftPersistenceEnabled || !draftReady || !legacyHydratedReadOnly) return;

    const baseline = legacyHydrationBaselineRef.current;
    const rid = restaurantId.trim();
    if (!baseline || !rid || baseline.restaurantId !== rid) return;
    if (document.restaurantId !== rid) return;
    if (createPersistableDocumentSignature(document) === baseline.signature) return;

    legacyHydrationBaselineRef.current = null;
    setLegacyHydratedReadOnly(false);
  }, [
    document,
    draftPersistenceEnabled,
    draftReady,
    legacyHydratedReadOnly,
    restaurantId,
  ]);

  useEffect(() => {
    if (!draftPersistenceEnabled || !draftReady) return;
    if (draftLoadBlocked) return;
    if (legacyHydratedReadOnly) return;
    if (document.restaurantId !== restaurantId.trim()) return;

    const signature = JSON.stringify(document);
    if (signature === lastDraftSignatureRef.current) return;

    const timeout = window.setTimeout(() => {
      historyApi.flushScheduledCommits(getDocumentSnapshot);
      void saveSalaEditorDraft(restaurantId, document, {
        updatedBy: currentUserId,
      })
        .then(() => {
          lastDraftSignatureRef.current = signature;
        })
        .catch((error) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[SalaEditorV2] No se pudo guardar el borrador", error);
          }
        });
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [
    currentUserId,
    document,
    draftLoadBlocked,
    draftPersistenceEnabled,
    draftReady,
    getDocumentSnapshot,
    historyApi,
    legacyHydratedReadOnly,
    restaurantId,
  ]);

  useEffect(() => {
    const rid = restaurantId.trim();
    if (!rid || !currentUserId) {
      setLegacyTablesForLinking([]);
      setLegacyFloorPlansForLinking([]);
      return;
    }

    let cancelled = false;
    void Promise.all([getTables(rid), getFloorPlans(rid)])
      .then(([tables, floorPlans]) => {
        if (cancelled) return;
        setLegacyTablesForLinking(
          tables.filter((table) =>
            isLegacyOperationalTableCandidate(table, rid),
          ),
        );
        setLegacyFloorPlansForLinking(
          floorPlans.filter((plan) => plan.restaurantId === rid),
        );
      })
      .catch((error) => {
        if (process.env.NODE_ENV === "development") {
          console.warn("[SalaEditorV2] No se pudieron cargar mesas legacy", error);
        }
        if (!cancelled) {
          setLegacyTablesForLinking([]);
          setLegacyFloorPlansForLinking([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUserId, restaurantId]);

  const operationalDragEnabled = document.navigation.phase === "operacion";

  const commitOperationalMoveHistory = useCallback(() => {
    historyApi.commitTransaction("operational.move", documentSnapshotRef.current!);
  }, [historyApi]);

  const discardOperationalMoveHistory = useCallback(() => {
    historyApi.discardTransaction();
  }, [historyApi]);

  const commitOperationalResizeHistory = useCallback(() => {
    historyApi.commitTransaction("operational.resize", documentSnapshotRef.current!);
  }, [historyApi]);

  const discardOperationalResizeHistory = useCallback(() => {
    historyApi.discardTransaction();
  }, [historyApi]);

  const clearOperationalSnapGuides = useCallback(() => {
    setOperationalSnapGuides(EMPTY_SMART_SNAP_GUIDES);
  }, []);

  const applyOperationalSnap = useCallback(
    (
      instanceId: string,
      raw: OperationalElementPosition,
      instance: OperationalElementInstance,
    ) => {
      if (!isOperationalSmartSnapType(instance)) {
        setOperationalSnapGuides(EMPTY_SMART_SNAP_GUIDES);
        return raw;
      }

      const peers = operationalElementInstancesInEspacio
        .filter(
          (candidate) =>
            candidate.id !== instanceId && isOperationalSmartSnapType(candidate),
        )
        .map(operationalInstanceToSnapRect);

      const result = snapRectToPeers(
        operationalPositionToSnapRect(instance, raw),
        peers,
        { threshold: SNAP_DISTANCE_PX },
      );

      setOperationalSnapGuides(result.guides);
      return snapRectToOperationalPosition(result.rect);
    },
    [operationalElementInstancesInEspacio],
  );

  const {
    draggingInstanceId: draggingOperationalInstanceId,
    dropAnimatingInstanceId: dropAnimatingOperationalInstanceId,
    beginInstancePointer,
    moveInstancePointer,
    endInstancePointer,
    cancelInstancePointer,
    cancelDragging,
    isDragging: isOperationalDragging,
    handleCanvasPointerDown: operationalCanvasPointerDown,
  } = useOperationalElementDragging({
    enabled: operationalDragEnabled,
    activePlacementTool: activeOperationalCatalogItem != null,
    escapeCancellationBlocked: addDialogOpen,
    onUpdatePosition: (instanceId, position) => {
      const instance = operationalElementInstancesInEspacio.find(
        (item) => item.id === instanceId,
      );
      if (!instance) {
        updateOperationalElement(instanceId, { position });
        return;
      }
      const snapped = applyOperationalSnap(
        instanceId,
        position,
        instance,
      );
      updateOperationalElement(instanceId, { position: snapped });
    },
    onSelectInstance: selectOperationalElementInstance,
    onClearSelection: clearOperationalElementInstance,
    onCancelPlacementTool: clearOperationalElement,
    onDragSessionStart: () => {
      historyApi.beginTransaction(documentSnapshotRef.current!);
    },
    onDragSessionEnd: (outcome) => {
      if (outcome === "complete") {
        commitOperationalMoveHistory();
      } else {
        discardOperationalMoveHistory();
      }
    },
  });

  const {
    resizingInstanceId: resizingOperationalInstanceId,
    startResize,
    updateResize,
    finishResize,
    cancelResize,
    isResizing: isOperationalResizing,
  } = useOperationalElementResizing({
    enabled: operationalDragEnabled,
    onSelectInstance: selectOperationalElementInstance,
    onResize: resizeOperationalElementInstance,
    onResizeSessionEnd: (outcome) => {
      if (outcome === "complete") {
        commitOperationalResizeHistory();
      } else {
        discardOperationalResizeHistory();
      }
    },
  });

  const handleOperationalResizeStart = useCallback(
    (
      instanceId: string,
      corner: Parameters<typeof startResize>[1],
      clientX: number,
      clientY: number,
    ) => {
      const instance = operationalElementInstancesInEspacio.find(
        (item) => item.id === instanceId,
      );
      if (!instance) return;
      historyApi.beginTransaction(documentSnapshotRef.current!);
      startResize(
        instanceId,
        corner,
        clientX,
        clientY,
        getOperationalInstanceCanvasSize(instance),
        instance.position,
      );
    },
    [historyApi, operationalElementInstancesInEspacio, startResize],
  );

  const handleOperationalCanvasPointerDown = useCallback(
    (point: { x: number; y: number }) => {
      operationalCanvasPointerDown(point, () => {
        if (!activeOperationalElementType) {
          placeOperationalElementAt(point);
          return;
        }
        const defaultSize = getDefaultOperationalInstanceCanvasSize(
          activeOperationalElementType,
        );
        const { position } = snapOperationalCenterPosition(point, {
          draggingInstanceId: "__placement__",
          instances: operationalElementInstancesInEspacio,
          size: defaultSize,
        });
        placeOperationalElementAt(position);
      });
    },
    [
      activeOperationalElementType,
      operationalCanvasPointerDown,
      operationalElementInstancesInEspacio,
      placeOperationalElementAt,
    ],
  );

  const handleOperationalInstancePointerDown = useCallback(
    (instanceId: string, payload: OperationalInstancePointerPayload) => {
      if (isOperationalResizing()) return;
      const instance = operationalElementInstancesInEspacio.find(
        (item) => item.id === instanceId,
      );
      if (!instance) return;
      beginInstancePointer(instanceId, {
        ...payload,
        canvasPoint: payload.point,
      }, instance.position);
    },
    [beginInstancePointer, isOperationalResizing, operationalElementInstancesInEspacio],
  );

  const handleOperationalInstancePointerMove = useCallback(
    (instanceId: string, payload: OperationalInstancePointerPayload) => {
      moveInstancePointer(instanceId, {
        ...payload,
        canvasPoint: payload.point,
      });
    },
    [moveInstancePointer],
  );

  const handleOperationalInstancePointerUp = useCallback(
    (instanceId: string) => {
      endInstancePointer(instanceId);
      clearOperationalSnapGuides();
    },
    [clearOperationalSnapGuides, endInstancePointer],
  );

  const handleOperationalInstancePointerCancel = useCallback(
    (instanceId: string) => {
      cancelInstancePointer(instanceId);
      clearOperationalSnapGuides();
    },
    [cancelInstancePointer, clearOperationalSnapGuides],
  );

  const wallDrawingEnabled =
    document.navigation.phase === "estructura" &&
    activeStructuralToolKind === "wall";

  const wallGridSize = selectedEspacio
    ? normalizeSalaEspacioBase(selectedEspacio.base).grid.size
    : 16;

  const handleWallEditSessionStart = useCallback(
    () => {
      historyApi.beginTransaction(documentSnapshotRef.current!);
    },
    [historyApi],
  );

  const handleWallEditSessionEnd = useCallback(
    (mode: WallEditMode, outcome: WallEditOutcome) => {
      if (outcome !== "complete") {
        historyApi.discardTransaction();
        return;
      }

      historyApi.commitTransaction(
        mode === "move" ? "wall.move" : "wall.resize",
        documentSnapshotRef.current!,
      );
    },
    [historyApi],
  );

  const {
    wallsInEspacio,
    draft: wallDraft,
    selectedWallId,
    selectedWall,
    cancelDrawing: cancelWallDrawing,
    cancelEditSession: cancelWallEditSession,
    clearWallSelection,
    handlePointerDown: handleWallPointerDown,
    handlePointerMove: handleWallPointerMove,
    handlePointerUp: handleWallPointerUp,
    handlePointerCancel: handleWallPointerCancel,
  } = useSalaWallDrawing({
    espacioId: selectedEspacio?.id ?? null,
    walls: document.walls,
    enabled: wallDrawingEnabled,
    gridSize: wallGridSize,
    onAddWall: addWall,
    onUpdateWall: updateWall,
    onEditSessionStart: handleWallEditSessionStart,
    onEditSessionEnd: handleWallEditSessionEnd,
  });

  const wallAttachmentsInEspacio = useMemo(() => {
    const wallIds = new Set(wallsInEspacio.map((wall) => wall.id));
    return document.wallAttachments.filter((attachment) =>
      wallIds.has(attachment.wallId),
    );
  }, [document.wallAttachments, wallsInEspacio]);

  const handleStructuralWallPointerDown = useCallback(
    (payload: Parameters<typeof handleWallPointerDown>[0]) => {
      clearWallAttachmentSelection();
      clearStructuralElementSelection();
      clearZoneSelection();
      clearLandscapeSelection();
      handleWallPointerDown(payload);
    },
    [
      clearLandscapeSelection,
      clearStructuralElementSelection,
      clearZoneSelection,
      clearWallAttachmentSelection,
      handleWallPointerDown,
    ],
  );

  const handleDeleteWall = useCallback(
    (wallId: string) => {
      removeWall(wallId);
      clearWallSelection();
    },
    [clearWallSelection, removeWall],
  );

  const handlePlaceWallAttachment = useCallback(
    (
      wallId: string,
      positionRatio: number,
      kind: SalaWallAttachmentKind,
    ) => {
      clearWallSelection();
      clearStructuralElementSelection();
      clearZoneSelection();
      clearLandscapeSelection();
      addWallAttachment({
        wallId,
        kind,
        positionRatio,
      });
    },
    [
      addWallAttachment,
      clearLandscapeSelection,
      clearStructuralElementSelection,
      clearZoneSelection,
      clearWallSelection,
    ],
  );

  const handleCreateSurfaceObject = useCallback(
    (draft: SurfaceObjectDraft) => {
      clearWallSelection();
      clearWallAttachmentSelection();
      addSurfaceObject(draft);
    },
    [addSurfaceObject, clearWallAttachmentSelection, clearWallSelection],
  );

  const handleSelectSurfaceObject = useCallback(
    (surfaceId: string | null) => {
      if (surfaceId) {
        clearWallSelection();
        clearWallAttachmentSelection();
      }
      selectSurfaceObject(surfaceId);
    },
    [clearWallAttachmentSelection, clearWallSelection, selectSurfaceObject],
  );

  const handleSurfaceMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleSurfaceMoveEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("surface.move", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleSurfaceResizeStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleSurfaceResizeEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("surface.resize", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleZoneMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleZoneMoveEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("zone.move", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleZoneResizeStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleZoneResizeEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("zone.resize", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleStructuralElementMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleStructuralElementMoveEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("structural.move", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleStructuralElementResizeStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleStructuralElementResizeEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction(
          "structural.resize",
          documentSnapshotRef.current!,
        );
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleLandscapeElementMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleLandscapeElementMoveEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("landscape.move", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleLandscapeElementResizeStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleLandscapeElementResizeEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("landscape.resize", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleCreateStructuralElement = useCallback(
    (draft: Parameters<typeof addStructuralElement>[0]) => {
      clearZoneSelection();
      clearWallSelection();
      clearWallAttachmentSelection();
      addStructuralElement(draft);
    },
    [addStructuralElement, clearWallAttachmentSelection, clearWallSelection, clearZoneSelection],
  );

  const handleSelectStructuralElement = useCallback(
    (elementId: string | null) => {
      if (elementId) {
        clearZoneSelection();
        clearWallSelection();
        clearWallAttachmentSelection();
      }
      selectStructuralElement(elementId);
    },
    [clearWallAttachmentSelection, clearWallSelection, clearZoneSelection, selectStructuralElement],
  );

  const handleCreateZone = useCallback(
    (draft: Parameters<typeof addZone>[0]) => {
      clearWallSelection();
      clearWallAttachmentSelection();
      addZone(draft);
    },
    [addZone, clearWallAttachmentSelection, clearWallSelection],
  );

  const handleSelectZone = useCallback(
    (zoneId: string | null) => {
      if (zoneId) {
        clearWallSelection();
        clearWallAttachmentSelection();
      }
      selectZone(zoneId);
    },
    [clearWallAttachmentSelection, clearWallSelection, selectZone],
  );

  const handleCreateLandscapeElement = useCallback(
    (draft: Parameters<typeof addLandscapeElement>[0]) => {
      clearWallSelection();
      clearWallAttachmentSelection();
      addLandscapeElement(draft);
    },
    [addLandscapeElement, clearWallAttachmentSelection, clearWallSelection],
  );

  const handleSelectLandscapeElement = useCallback(
    (elementId: string | null) => {
      if (elementId) {
        clearZoneSelection();
        clearWallSelection();
        clearWallAttachmentSelection();
      }
      selectLandscapeElement(elementId);
    },
    [clearWallAttachmentSelection, clearWallSelection, clearZoneSelection, selectLandscapeElement],
  );

  const handleSelectWallAttachment = useCallback(
    (attachmentId: string) => {
      clearWallSelection();
      clearStructuralElementSelection();
      clearZoneSelection();
      clearLandscapeSelection();
      selectWallAttachment(attachmentId);
    },
    [
      clearLandscapeSelection,
      clearStructuralElementSelection,
      clearZoneSelection,
      clearWallSelection,
      selectWallAttachment,
    ],
  );

  const handleWallAttachmentMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleWallAttachmentMoveEnd = useCallback(
    (outcome: WallAttachmentEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction(
          "wallAttachment.move",
          documentSnapshotRef.current!,
        );
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleCreateEspacio = useCallback(
    (payload: { name: string; tipo: SalaEspacioType; color: string }) => {
      const created = createLocalEspacio({
        restaurantId: document.restaurantId,
        name: payload.name,
        tipo: payload.tipo,
        color: payload.color,
        sortOrder: nextEspacioSortOrder(document.espacios),
      });
      addEspacioAndSelect(created);
    },
    [addEspacioAndSelect, document.espacios, document.restaurantId],
  );

  const handleUpdateEspacio = useCallback(
    (patch: Partial<SalaEspacioDraft>) => {
      if (!selectedEspacio) return;
      updateEspacio(selectedEspacio.id, patch);
    },
    [selectedEspacio, updateEspacio],
  );

  const handleSelectEspacio = useCallback(
    (espacioId: string) => {
      selectEspacio(espacioId);
    },
    [selectEspacio],
  );

  const handleDuplicateEspacio = useCallback(
    (espacioId: string) => {
      duplicateEspacio(espacioId);
    },
    [duplicateEspacio],
  );

  const previousEspacioIdRef = useRef<string | null>(selectedEspacio?.id ?? null);

  useEffect(() => {
    const nextId = selectedEspacio?.id ?? null;
    if (
      previousEspacioIdRef.current != null &&
      previousEspacioIdRef.current !== nextId
    ) {
      cancelDragging();
      cancelResize();
      cancelWallDrawing();
      cancelWallEditSession();
      clearOperationalSnapGuides();
      historyApi.discardTransaction();
    }
    previousEspacioIdRef.current = nextId;
  }, [
    cancelDragging,
    cancelResize,
    cancelWallEditSession,
    cancelWallDrawing,
    clearOperationalSnapGuides,
    historyApi,
    selectedEspacio?.id,
  ]);

  useEffect(() => {
    if (document.navigation.phase !== "operacion") {
      clearOperationalSnapGuides();
    }
  }, [clearOperationalSnapGuides, document.navigation.phase]);

  const openAddDialog = useCallback(() => {
    setAddDialogOpen(true);
  }, []);

  const handleUndo = useCallback(() => {
    cancelDragging();
    cancelResize();
    cancelWallDrawing();
    cancelWallEditSession();
    clearOperationalSnapGuides();
    historyApi.discardTransaction();
    historyApi.flushScheduledCommits(getDocumentSnapshot);

    const nextDocument = historyApi.undo(documentSnapshotRef.current!);
    if (!nextDocument) return;

    restoreDocumentSnapshot(nextDocument);
  }, [
    cancelDragging,
    cancelResize,
    cancelWallEditSession,
    cancelWallDrawing,
    clearOperationalSnapGuides,
    getDocumentSnapshot,
    historyApi,
    restoreDocumentSnapshot,
  ]);

  const handleRedo = useCallback(() => {
    cancelDragging();
    cancelResize();
    cancelWallDrawing();
    cancelWallEditSession();
    clearOperationalSnapGuides();
    historyApi.discardTransaction();
    historyApi.flushScheduledCommits(getDocumentSnapshot);

    const nextDocument = historyApi.redo(documentSnapshotRef.current!);
    if (!nextDocument) return;

    restoreDocumentSnapshot(nextDocument);
  }, [
    cancelDragging,
    cancelResize,
    cancelWallEditSession,
    cancelWallDrawing,
    clearOperationalSnapGuides,
    getDocumentSnapshot,
    historyApi,
    restoreDocumentSnapshot,
  ]);

  const handlePublishToTpv = useCallback(() => {
    const rid = restaurantId.trim();
    const initialSnapshot = documentSnapshotRef.current;
    if (SALA_EDITOR_DEV_DIAGNOSTICS) {
      console.info("[SalaEditorV2][FirestoreDiag] Publicar en TPV handler alcanzado", {
        operation: "publishToTpv.handler",
        restaurantId: rid,
        uid: currentUserId,
        draftReady,
        hasDocumentSnapshot: initialSnapshot != null,
        publishToTpvPending,
      });
      console.info("[SalaEditorV2] Publicar en TPV handler iniciado", {
        restaurantId: rid,
        draftReady,
        hasDocumentSnapshot: initialSnapshot != null,
        publishToTpvPending,
        espacios: initialSnapshot?.espacios.length ?? 0,
        mesas: initialSnapshot?.operationalElementInstances.length ?? 0,
        zonas: initialSnapshot?.zones.length ?? 0,
      });
    }

    if (publishToTpvPending) {
      if (SALA_EDITOR_DEV_DIAGNOSTICS) {
        console.info("[SalaEditorV2] Publicacion cancelada: ya hay una publicacion en curso");
      }
      setPublishToTpvStatus("Ya hay una publicacion en curso.");
      return;
    }

    if (
      !draftReady ||
      draftLoadBlocked ||
      legacyHydratedReadOnly ||
      initialSnapshot?.restaurantId !== rid
    ) {
      setPublishToTpvStatus(
        draftLoadBlocked
          ? "No se puede publicar porque el borrador no se cargó de forma segura."
          : "Espera a que el borrador esté listo antes de publicar.",
      );
      return;
    }

    if (!rid) {
      if (SALA_EDITOR_DEV_DIAGNOSTICS) {
        console.warn("[SalaEditorV2] Publicacion cancelada: restaurantId vacio");
      }
      setPublishToTpvStatus("No se pudo publicar: restaurante no disponible.");
      return;
    }

    if (!initialSnapshot) {
      if (SALA_EDITOR_DEV_DIAGNOSTICS) {
        console.warn("[SalaEditorV2] Publicacion cancelada: documento no disponible");
      }
      setPublishToTpvStatus("No se pudo publicar: mapa no cargado.");
      return;
    }

    historyApi.flushScheduledCommits(getDocumentSnapshot);
    const snapshot = getDocumentSnapshot();
    const nameCorrection = autoCorrectDuplicateOperationalTableNames(snapshot);
    if (nameCorrection.corrections.length > 0) {
      historyApi.recordCommit(
        "operational.rename",
        snapshot,
        nameCorrection.document,
      );
      restoreDocumentSnapshot(nameCorrection.document);
      const preview = nameCorrection.corrections
        .slice(0, 4)
        .map((item) => `${item.previousName} → ${item.nextName}`)
        .join(", ");
      const remaining = Math.max(0, nameCorrection.corrections.length - 4);
      setPublishToTpvStatus(
        `Hostly corrigió ${nameCorrection.corrections.length} nombre${
          nameCorrection.corrections.length === 1 ? "" : "s"
        } duplicado${nameCorrection.corrections.length === 1 ? "" : "s"}: ${preview}${
          remaining > 0 ? ` y ${remaining} más` : ""
        }. Revisa los cambios o deshazlos; vuelve a publicar para confirmarlos.`,
      );
      return;
    }
    traceBeforePublisherSpaces(snapshot);
    logSalaEditorDocumentPublicationDebug(snapshot);
    setPublishToTpvPending(true);
    setPublishToTpvStatus("Publicando mapa operativo...");
    if (SALA_EDITOR_DEV_DIAGNOSTICS) {
      console.info("[SalaEditorV2] Llamando publisher TPV", {
        restaurantId: rid,
        documentRestaurantId: snapshot.restaurantId,
        draftReady,
      });
    }

    void publishSalaEditorV2Phase1ToLegacy({
      restaurantId: rid,
      document: snapshot,
    })
      .then(async (result) => {
        if (SALA_EDITOR_DEV_DIAGNOSTICS) {
          console.info("[SalaEditorV2] Publisher TPV completado", {
            floorPlansUpdated: result.floorPlansUpdated,
            tablesUpdated: result.tablesUpdated,
            zonesUpdated: result.zonesUpdated,
            decorativeTablesUpdated: result.decorativeTablesUpdated,
            decorativeLegacyFound: result.decorativeLegacyFound,
            decorativeLegacyDeactivated: result.decorativeLegacyDeactivated,
            decorativeAuditItems: result.decorativeAudit.length,
            newOperationalTableLinks: result.newOperationalTableLinks.length,
          });
        }
        const applyPublicationLinks = (
          sourceDocument: SalaEditorDocument,
        ): { document: SalaEditorDocument; linkedCount: number } => {
          const linksByInstanceId = new Map(
            result.newOperationalTableLinks.map((link) => [link.instanceId, link]),
          );
          const linksBySpaceId = new Map(
            result.newSpaceFloorPlanLinks.map((link) => [link.spaceId, link]),
          );
          let linkedCount = 0;
          const linkedDocument: SalaEditorDocument = {
            ...sourceDocument,
            espacios: sourceDocument.espacios.map((space) => {
              const link = linksBySpaceId.get(space.id);
              if (!link || stringOrEmpty(space.legacyFloorPlanId)) return space;
              linkedCount += 1;
              return { ...space, legacyFloorPlanId: link.legacyFloorPlanIdAfter };
            }),
            operationalElementInstances: sourceDocument.operationalElementInstances.map(
              (instance) => {
                const link = linksByInstanceId.get(instance.id);
                if (!link) return instance;
                const currentLegacyTableId =
                  typeof instance.metadata.legacyTableId === "string"
                    ? instance.metadata.legacyTableId.trim()
                    : "";
                if (currentLegacyTableId) return instance;
                linkedCount += 1;
                return {
                  ...instance,
                  metadata: {
                    ...instance.metadata,
                    legacyTableId: link.legacyTableIdAfter,
                  },
                };
              },
            ),
            updatedAt: Date.now(),
          };
          return { document: linkedDocument, linkedCount };
        };

        const currentProjection = applyPublicationLinks(getDocumentSnapshot());
        if (currentProjection.linkedCount > 0) {
          const nextDocument = currentProjection.document;
          restoreDocumentSnapshot(nextDocument);
          if (draftPersistenceEnabled && draftReady) {
            const signature = JSON.stringify(nextDocument);
            await saveSalaEditorDraft(rid, nextDocument, {
              updatedBy: currentUserIdRef.current,
            });
            lastDraftSignatureRef.current = signature;
          }

          if (SALA_EDITOR_DEV_DIAGNOSTICS) {
            console.info("[SalaEditorV2][PublicationLinks] Draft links persisted", {
              linkedCount: currentProjection.linkedCount,
              floorPlanLinks: result.newSpaceFloorPlanLinks,
              tableLinks: result.newOperationalTableLinks,
            });
          }
        }
        logSalaEditorPublicationDebug(result);
        setPublishToTpvStatus(formatSalaEditorPublicationSummary(result));
      })
      .catch((error) => {
        if (SALA_EDITOR_DEV_DIAGNOSTICS) {
          console.error("[SalaEditorV2] No se pudo publicar hacia TPV", error);
          const firestoreError = error as {
            code?: unknown;
            message?: unknown;
            name?: unknown;
          };
          console.error("[SalaEditorV2][FirestoreDiag] publishToTpv.finalCatch", {
            operation: "publishToTpv.finalCatch",
            restaurantId: rid,
            uid: currentUserId,
            errorName: typeof firestoreError.name === "string" ? firestoreError.name : null,
            errorCode: typeof firestoreError.code === "string" ? firestoreError.code : null,
            errorMessage:
              typeof firestoreError.message === "string"
                ? firestoreError.message
                : String(error),
            lastFirestoreOperation: getLastSalaEditorV2PublisherFirestoreOperation(),
          });
        }
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Revisa permisos o conexion.";
        setPublishToTpvStatus(`No se pudo publicar: ${message}`);
      })
      .finally(() => {
        if (SALA_EDITOR_DEV_DIAGNOSTICS) {
          console.info("[SalaEditorV2] Flujo publicar en TPV finalizado");
        }
        setPublishToTpvPending(false);
      });
  }, [
    draftPersistenceEnabled,
    draftLoadBlocked,
    draftReady,
    getDocumentSnapshot,
    historyApi,
    currentUserId,
    legacyHydratedReadOnly,
    publishToTpvPending,
    restaurantId,
    restoreDocumentSnapshot,
  ]);

  const linkedLegacyTableIds = useMemo(
    () =>
      document.operationalElementInstances
        .map((instance) => readLegacyTableIdFromMetadata(instance.metadata))
        .filter((legacyTableId) => legacyTableId !== ""),
    [document.operationalElementInstances],
  );

  const offerLegacyTableAutoLink = useMemo(
    () =>
      shouldOfferLegacyTableAutoLink({
        instances: document.operationalElementInstances,
        legacyTables: legacyTablesForLinking,
        restaurantId,
      }),
    [document.operationalElementInstances, legacyTablesForLinking, restaurantId],
  );

  const linkedTableNamesById = useMemo(() => {
    const names: Record<string, string> = {};
    for (const table of legacyTablesForLinking) {
      names[table.id] = table.name;
    }
    return names;
  }, [legacyTablesForLinking]);

  const applyLegacyTableAutoLinkResult = useCallback(
    (result: LegacyTableAutoLinkResult) => {
      if (result.updates.length === 0) return;
      const snapshot = documentSnapshotRef.current;
      if (!snapshot) return;

      setLegacyHydratedReadOnly(false);
      for (const update of result.updates) {
        const instance = snapshot.operationalElementInstances.find(
          (item) => item.id === update.instanceId,
        );
        if (!instance || instance.elementType !== "TABLE") continue;
        updateOperationalElement(update.instanceId, {
          metadata: {
            ...instance.metadata,
            legacyTableId: update.legacyTableId,
          },
        });
      }
    },
    [updateOperationalElement],
  );

  const handleAutoLinkTables = useCallback(() => {
    if (autoLinkTablesPending) return;
    const snapshot = documentSnapshotRef.current;
    if (!snapshot) return;

    setAutoLinkTablesPending(true);
    try {
      const result = computeSafeLegacyTableAutoLinks({
        instances: snapshot.operationalElementInstances,
        legacyTables: legacyTablesForLinking,
        restaurantId,
      });
      logSalaEditorAutoLinkDebug(result);
      applyLegacyTableAutoLinkResult(result);
      setPublishToTpvStatus(formatSalaEditorAutoLinkSummary(result));
    } finally {
      setAutoLinkTablesPending(false);
    }
  }, [
    applyLegacyTableAutoLinkResult,
    autoLinkTablesPending,
    legacyTablesForLinking,
    restaurantId,
  ]);

  useEffect(() => {
    const corrected = [...document.operationalElementInstances]
      .reverse()
      .find(
        (instance) =>
          instance.id !== lastOperationalNameCorrectionIdRef.current &&
          typeof instance.metadata.hostlyAutoCorrectedFrom === "string" &&
          instance.metadata.hostlyAutoCorrectedFrom.trim() !== "",
      );
    if (!corrected) return;
    lastOperationalNameCorrectionIdRef.current = corrected.id;
    const previousName = String(corrected.metadata.hostlyAutoCorrectedFrom).trim();
    const spaceName =
      document.espacios.find((space) => space.id === corrected.spaceId)?.name.trim() ||
      "este espacio";
    setPublishToTpvStatus(
      `Nombre corregido para evitar duplicados: ${previousName} → ${corrected.name} en ${spaceName}.`,
    );
  }, [document.espacios, document.operationalElementInstances]);

  useEffect(() => {
    if (legacyTablesForLinking.length === 0) return;

    const currentIds = new Set(
      document.operationalElementInstances.map((instance) => instance.id),
    );
    const knownIds = knownOperationalInstanceIdsRef.current;
    if (!knownOperationalInstanceIdsReadyRef.current) {
      knownOperationalInstanceIdsRef.current = currentIds;
      knownOperationalInstanceIdsReadyRef.current = true;
      return;
    }

    const newUnlinkedTableIds = new Set(
      document.operationalElementInstances
        .filter(
          (instance) =>
            instance.elementType === "TABLE" &&
            !knownIds.has(instance.id) &&
            !readLegacyTableIdFromMetadata(instance.metadata),
        )
        .map((instance) => instance.id),
    );
    knownOperationalInstanceIdsRef.current = currentIds;
    if (newUnlinkedTableIds.size === 0) return;

    const result = computeSafeLegacyTableAutoLinks({
      instances: document.operationalElementInstances,
      legacyTables: legacyTablesForLinking,
      restaurantId,
      targetInstanceIds: newUnlinkedTableIds,
    });
    logSalaEditorAutoLinkDebug(result);
    applyLegacyTableAutoLinkResult(result);
    if (result.updates.length > 0) {
      setPublishToTpvStatus(formatSalaEditorAutoLinkSummary(result));
    }
  }, [
    applyLegacyTableAutoLinkResult,
    document.operationalElementInstances,
    legacyTablesForLinking,
    restaurantId,
  ]);

  const handleLinkOperationalElementToLegacyTable = useCallback(
    (instanceId: string, legacyTableId: string | null) => {
      const snapshot = documentSnapshotRef.current;
      const instance = snapshot?.operationalElementInstances.find(
        (item) => item.id === instanceId,
      );
      if (!snapshot || !instance || instance.elementType !== "TABLE") return;

      const nextLegacyTableId = legacyTableId?.trim() ?? "";
      if (nextLegacyTableId) {
        const candidate = legacyTablesForLinking.find(
          (table) => table.id === nextLegacyTableId,
        );
        if (
          !candidate ||
          !isLegacyOperationalTableCandidate(candidate, restaurantId)
        ) {
          return;
        }

        const alreadyLinked = snapshot.operationalElementInstances.some(
          (item) =>
            item.id !== instanceId &&
            readLegacyTableIdFromMetadata(item.metadata) === nextLegacyTableId,
        );
        if (alreadyLinked) return;
      }

      const nextMetadata =
        nextLegacyTableId === ""
          ? (() => {
              const { legacyTableId: _legacyTableId, ...rest } = instance.metadata;
              void _legacyTableId;
              return rest;
            })()
          : {
              ...instance.metadata,
              legacyTableId: nextLegacyTableId,
            };

      setLegacyHydratedReadOnly(false);
      updateOperationalElement(instanceId, { metadata: nextMetadata });
      setPublishToTpvStatus(null);
    },
    [legacyTablesForLinking, restaurantId, updateOperationalElement],
  );

  const canUndoHistory = historyApi.canUndo();
  const canRedoHistory = historyApi.canRedo();

  const selectedElementCount = selectedEspacio
    ? (elementCountByEspacioId[selectedEspacio.id] ?? 0)
    : 0;

  const inspectorOpen = hasSalaEditorInspectorSelection({
    phase: document.navigation.phase,
    espacio: selectedEspacio,
    selectedWall: selectedWall ?? null,
    selectedOperationalElementInstance: selectedOperationalElementInstance ?? null,
  });

  const selectedSurfaceObject = useMemo(
    () =>
      selectedSurfaceObjectId
        ? surfaceObjectsInEspacio.find((surface) => surface.id === selectedSurfaceObjectId) ?? null
        : null,
    [selectedSurfaceObjectId, surfaceObjectsInEspacio],
  );

  const selectedWallAttachment = useMemo(
    () =>
      selectedWallAttachmentId
        ? wallAttachmentsInEspacio.find(
            (attachment) => attachment.id === selectedWallAttachmentId,
          ) ?? null
        : null,
    [selectedWallAttachmentId, wallAttachmentsInEspacio],
  );

  const contextActionTarget = useMemo((): SalaEditorContextActionTarget | null => {
    const phase = document.navigation.phase;

    if (phase === "estructura" && selectedStructuralElement) {
      const labels = {
        squareColumn: "Columna cuadrada",
        roundColumn: "Columna circular",
        divider: "Separador fijo",
      } as const;
      const icons = {
        squareColumn: "■",
        roundColumn: "●",
        divider: "▭",
      } as const;
      const kind = selectedStructuralElement.kind;
      return {
        kind: "structural",
        label: kind in labels ? labels[kind as keyof typeof labels] : "Elemento fijo",
        icon: kind in icons ? icons[kind as keyof typeof icons] : "▣",
        onDelete: () => removeStructuralElement(selectedStructuralElement.id),
      };
    }

    if (phase === "terreno" && selectedSurfaceObject) {
      return {
        kind: "surface",
        label: "Superficie",
        icon: "▧",
        onDelete: () => removeSurfaceObject(selectedSurfaceObject.id),
      };
    }

    if (phase === "zonas" && selectedZone) {
      return {
        kind: "zone",
        label: selectedZone.name,
        icon: "◫",
        onDelete: () => removeZone(selectedZone.id),
      };
    }

    if (phase === "paisajismo" && selectedLandscapeElement) {
      const item = getLandscapeToolboxItem(selectedLandscapeElement.kind);
      return {
        kind: "landscape",
        label: item?.label ?? "Ambiente",
        icon: item?.icon ?? "♧",
        onDelete: () => removeLandscapeElement(selectedLandscapeElement.id),
      };
    }

    if (phase === "estructura" && selectedWallAttachment) {
      const isGlass = selectedWallAttachment.kind === "glass";
      return {
        kind: isGlass ? "glass" : "door",
        label: isGlass ? "Cristal" : "Puerta",
        icon: isGlass ? "▥" : "▭",
        onDelete: () => removeWallAttachment(selectedWallAttachment.id),
      };
    }

    if (phase === "estructura" && selectedWall) {
      return {
        kind: "wall",
        label: "Muro",
        icon: "━",
        onDelete: () => handleDeleteWall(selectedWall.id),
      };
    }

    if (phase === "operacion" && selectedOperationalElementInstance) {
      const catalogItem = getOperationalElementCatalogItem(
        selectedOperationalElementInstance.elementType,
      );
      return {
        kind: "operational",
        label: catalogItem?.label ?? "Elemento operativo",
        icon: catalogItem?.icon ?? "◉",
        onDelete: () => removeOperationalElement(selectedOperationalElementInstance.id),
      };
    }

    return null;
  }, [
    document.navigation.phase,
    handleDeleteWall,
    removeOperationalElement,
    removeLandscapeElement,
    removeZone,
    removeSurfaceObject,
    removeStructuralElement,
    removeWallAttachment,
    selectedOperationalElementInstance,
    selectedLandscapeElement,
    selectedZone,
    selectedSurfaceObject,
    selectedStructuralElement,
    selectedWall,
    selectedWallAttachment,
  ]);

  return (
    <>
      <SalaEditorShell
        navigation={document.navigation}
        disabledPhases={disabledPhases}
        espaciosCount={document.espacios.length}
        inspectorOpen={inspectorOpen}
        onPhaseChange={setPhase}
        legacyEditorHref={legacyEditorHref}
        canUndo={canUndoHistory}
        canRedo={canRedoHistory}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAutoLinkTables={offerLegacyTableAutoLink ? handleAutoLinkTables : undefined}
        autoLinkTablesDisabled={!draftReady || legacyTablesForLinking.length === 0}
        autoLinkTablesPending={autoLinkTablesPending}
        onPublishToTpv={handlePublishToTpv}
        publishToTpvDisabled={
          !draftReady ||
          draftLoadBlocked ||
          legacyHydratedReadOnly ||
          document.restaurantId !== restaurantId.trim()
        }
        publishToTpvPending={publishToTpvPending}
        publishToTpvStatus={publishToTpvStatus}
        contextActionTarget={contextActionTarget}
        leftPanel={
          <SalaEditorLeftPanel
            phase={document.navigation.phase}
            espacios={document.espacios}
            selectedEspacioId={document.navigation.selectedEspacioId}
            elementCountByEspacioId={elementCountByEspacioId}
            activeStructuralToolKind={activeStructuralToolKind}
            activeZoneType={activeZoneType}
            activeLandscapeKind={activeLandscapeKind}
            activeSurfaceMaterial={activeSurfaceMaterial}
            activeOperationalElementType={activeOperationalElementType}
            activeOperationalVisualVariant={activeOperationalVisualVariant}
            onSelectEspacio={handleSelectEspacio}
            onRequestAddEspacio={openAddDialog}
            onDuplicateEspacio={handleDuplicateEspacio}
            onReorderEspacios={reorderEspacios}
            onSelectStructuralTool={selectTool}
            onSelectZoneType={selectZoneType}
            onSelectLandscapeKind={selectLandscapeKind}
            onSelectSurfaceMaterial={selectSurfaceMaterial}
            onSelectOperationalElement={selectOperationalElement}
            onUpdateEspacio={updateEspacio}
            onUpdateEspacioBase={updateEspacioBase}
          />
        }
        workspace={
          <SalaEditorWorkspaceCanvas
            restaurantId={document.restaurantId}
            phase={document.navigation.phase}
            espacio={selectedEspacio}
            hasEspacios={document.espacios.length > 0}
            activeStructuralToolboxItem={activeStructuralToolboxItem}
            activeSurfaceMaterial={activeSurfaceMaterial}
            surfaceObjects={surfaceObjectsInEspacio}
            selectedSurfaceObjectId={selectedSurfaceObjectId}
            onSurfaceObjectCreate={handleCreateSurfaceObject}
            onSurfaceObjectSelect={handleSelectSurfaceObject}
            onSurfaceObjectClearSelection={clearSurfaceSelection}
            onSurfaceObjectUpdate={updateSurfaceObject}
            onSurfaceObjectMoveStart={handleSurfaceMoveStart}
            onSurfaceObjectMoveEnd={handleSurfaceMoveEnd}
            onSurfaceObjectResizeStart={handleSurfaceResizeStart}
            onSurfaceObjectResizeEnd={handleSurfaceResizeEnd}
            activeZoneType={activeZoneType}
            zones={zonesInEspacio}
            selectedZoneId={selectedZoneId}
            onZoneCreate={handleCreateZone}
            onZoneSelect={handleSelectZone}
            onZoneClearSelection={clearZoneSelection}
            onZoneUpdate={updateZone}
            onZoneMoveStart={handleZoneMoveStart}
            onZoneMoveEnd={handleZoneMoveEnd}
            onZoneResizeStart={handleZoneResizeStart}
            onZoneResizeEnd={handleZoneResizeEnd}
            structuralElements={structuralElementsInEspacio}
            selectedStructuralElementId={selectedStructuralElementId}
            onStructuralElementCreate={handleCreateStructuralElement}
            onStructuralElementSelect={handleSelectStructuralElement}
            onStructuralElementClearSelection={clearStructuralElementSelection}
            onStructuralElementUpdate={updateStructuralElement}
            onStructuralElementMoveStart={handleStructuralElementMoveStart}
            onStructuralElementMoveEnd={handleStructuralElementMoveEnd}
            onStructuralElementResizeStart={handleStructuralElementResizeStart}
            onStructuralElementResizeEnd={handleStructuralElementResizeEnd}
            activeLandscapeKind={activeLandscapeKind}
            landscapeElements={landscapeElementsInEspacio}
            selectedLandscapeElementId={selectedLandscapeElementId}
            onLandscapeElementCreate={handleCreateLandscapeElement}
            onLandscapeElementSelect={handleSelectLandscapeElement}
            onLandscapeElementClearSelection={clearLandscapeSelection}
            onLandscapeElementUpdate={updateLandscapeElement}
            onLandscapeElementMoveStart={handleLandscapeElementMoveStart}
            onLandscapeElementMoveEnd={handleLandscapeElementMoveEnd}
            onLandscapeElementResizeStart={handleLandscapeElementResizeStart}
            onLandscapeElementResizeEnd={handleLandscapeElementResizeEnd}
            walls={wallsInEspacio}
            wallAttachments={wallAttachmentsInEspacio}
            wallDraft={wallDraft}
            selectedWallId={selectedWallId}
            selectedWallAttachmentId={selectedWallAttachmentId}
            onWallPointerDown={wallDrawingEnabled ? handleStructuralWallPointerDown : undefined}
            onWallPointerMove={wallDrawingEnabled ? handleWallPointerMove : undefined}
            onWallPointerUp={wallDrawingEnabled ? handleWallPointerUp : undefined}
            onWallPointerCancel={wallDrawingEnabled ? handleWallPointerCancel : undefined}
            onWallAttachmentPlace={handlePlaceWallAttachment}
            onWallAttachmentSelect={handleSelectWallAttachment}
            onWallAttachmentClearSelection={clearWallAttachmentSelection}
            onWallAttachmentUpdate={updateWallAttachment}
            onWallAttachmentMoveStart={handleWallAttachmentMoveStart}
            onWallAttachmentMoveEnd={handleWallAttachmentMoveEnd}
            activeOperationalCatalogItem={activeOperationalCatalogItem}
            operationalElementInstances={operationalElementInstancesInEspacio}
            selectedOperationalElementInstanceId={selectedOperationalElementInstanceId}
            draggingOperationalInstanceId={draggingOperationalInstanceId}
            resizingOperationalInstanceId={resizingOperationalInstanceId}
            dropAnimatingOperationalInstanceId={dropAnimatingOperationalInstanceId}
            linkedTableNamesById={linkedTableNamesById}
            operationalSnapGuides={operationalSnapGuides}
            isOperationalDragging={isOperationalDragging}
            isOperationalResizing={isOperationalResizing}
            onOperationalCanvasPointerDown={handleOperationalCanvasPointerDown}
            onOperationalInstancePointerDown={handleOperationalInstancePointerDown}
            onOperationalInstancePointerMove={handleOperationalInstancePointerMove}
            onOperationalInstancePointerUp={handleOperationalInstancePointerUp}
            onOperationalInstancePointerCancel={handleOperationalInstancePointerCancel}
            onOperationalResizeStart={handleOperationalResizeStart}
            onOperationalResizeMove={updateResize}
            onOperationalResizeEnd={finishResize}
            onOperationalResizeCancel={cancelResize}
            onOperationalDuplicateInstance={duplicateOperationalElement}
            onRequestCreateEspacio={openAddDialog}
          />
        }
        inspector={
          <SalaEditorInspectorPanel
            phase={document.navigation.phase}
            espacio={selectedEspacio}
            elementCount={selectedElementCount}
            activeStructuralToolboxItem={activeStructuralToolboxItem}
            selectedWall={selectedWall}
            activeOperationalCatalogItem={activeOperationalCatalogItem}
            selectedOperationalElementInstance={selectedOperationalElementInstance}
            legacyTables={legacyTablesForLinking}
            legacyFloorPlans={legacyFloorPlansForLinking}
            linkedLegacyTableIds={linkedLegacyTableIds}
            onLinkOperationalElementToLegacyTable={handleLinkOperationalElementToLegacyTable}
            onUpdateEspacio={handleUpdateEspacio}
          />
        }
      />

      {addDialogOpen ? (
        <SalaAddEspacioDialog
          open
          onClose={() => setAddDialogOpen(false)}
          onCreate={handleCreateEspacio}
        />
      ) : null}
    </>
  );
}

export { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
export { SalaEditorPhaseNav } from "@/components/sala-editor/sala-editor-phase-nav";
export * from "@/components/sala-editor/phases";
export * from "@/components/sala-editor/panels";
