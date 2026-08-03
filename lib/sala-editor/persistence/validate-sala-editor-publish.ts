import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { SALA_EDITOR_DOCUMENT_VERSION } from "@/lib/sala-editor/types/editor-document";
import { normalizeSalaEditorDocument } from "@/lib/sala-editor/normalize/normalize-sala-editor-document";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import { getOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";

export type SalaEditorPublishValidationError = {
  code: string;
  message: string;
};

export type SalaEditorPublishValidationOk = {
  ok: true;
  document: SalaEditorDocument;
};

export type SalaEditorPublishValidationResult =
  | SalaEditorPublishValidationOk
  | { ok: false; error: SalaEditorPublishValidationError };

const KNOWN_OP_TYPES = new Set<OperationalElementType>([
  "TABLE",
  "HIGH_TABLE",
  "BAR_SEAT",
  "BAR_STRAIGHT",
  "BAR_L",
  "RECEPTION",
  "WAITER_STATION",
  "SOFA",
  "SUNBED",
  "BALINESE_BED",
  "ROOM",
  "CABANA",
  "PICKUP_POINT",
  "CUSTOM",
]);

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function fail(code: string, message: string): SalaEditorPublishValidationResult {
  return { ok: false, error: { code, message } };
}

/**
 * Valida y normaliza un documento V2 antes de escribir `published`.
 * No muta el draft; no escribe Firestore.
 */
export function validateSalaEditorDocumentForPublish(
  raw: SalaEditorDocument,
  expectedRestaurantId: string,
): SalaEditorPublishValidationResult {
  const rid = String(expectedRestaurantId ?? "").trim();
  if (!rid) {
    return fail("RESTAURANT_ID_REQUIRED", "restaurantId obligatorio");
  }
  if (raw.restaurantId !== rid) {
    return fail("TABLE_TENANT_MISMATCH", "document.restaurantId no coincide");
  }
  if (raw.version !== SALA_EDITOR_DOCUMENT_VERSION) {
    return fail("SCHEMA_VERSION_MISMATCH", "version de documento incompatible");
  }

  let document: SalaEditorDocument;
  try {
    document = normalizeSalaEditorDocument(raw);
  } catch (e) {
    return fail(
      "NORMALIZE_FAILED",
      e instanceof Error ? e.message : "normalización fallida",
    );
  }

  const espacioIds = new Set<string>();
  for (const espacio of document.espacios) {
    const id = String(espacio.id ?? "").trim();
    if (!id) return fail("INVALID_ESPACIO_ID", "espacio sin id");
    if (espacioIds.has(id)) {
      return fail("DUPLICATE_ESPACIO_ID", `espacio duplicado: ${id}`);
    }
    espacioIds.add(id);
    if (espacio.restaurantId && espacio.restaurantId !== rid) {
      return fail("TABLE_TENANT_MISMATCH", `espacio ${id} tenant mismatch`);
    }
    const base = espacio.base;
    if (base) {
      if (!isFiniteNumber(base.dimensions.width) || base.dimensions.width <= 0) {
        return fail("INVALID_PLAN_DIMENSIONS", `espacio ${id}: width inválido`);
      }
      if (!isFiniteNumber(base.dimensions.height) || base.dimensions.height <= 0) {
        return fail("INVALID_PLAN_DIMENSIONS", `espacio ${id}: height inválido`);
      }
      if (
        !isFiniteNumber(base.scale.pixelsPerUnit) ||
        base.scale.pixelsPerUnit <= 0
      ) {
        return fail("INVALID_PLAN_SCALE", `espacio ${id}: pixelsPerUnit inválido`);
      }
    }
  }

  const instanceIds = new Set<string>();
  for (const instance of document.operationalElementInstances) {
    const id = String(instance.id ?? "").trim();
    if (!id) return fail("INVALID_INSTANCE_ID", "instancia operativa sin id");
    if (instanceIds.has(id)) {
      return fail("DUPLICATE_INSTANCE_ID", `instancia duplicada: ${id}`);
    }
    instanceIds.add(id);
    if (!KNOWN_OP_TYPES.has(instance.elementType)) {
      return fail(
        "UNKNOWN_ELEMENT_TYPE",
        `tipo operativo desconocido: ${String(instance.elementType)}`,
      );
    }
    if (!isFiniteNumber(instance.position.x) || !isFiniteNumber(instance.position.y)) {
      return fail("INVALID_GEOMETRY", `instancia ${id}: posición no finita`);
    }
    if (!isFiniteNumber(instance.rotation)) {
      return fail("INVALID_GEOMETRY", `instancia ${id}: rotación no finita`);
    }
    const size = getOperationalInstanceCanvasSize(instance);
    if (size.width <= 0 || size.height <= 0) {
      return fail("INVALID_GEOMETRY", `instancia ${id}: tamaño inválido`);
    }
    if (instance.spaceId && !espacioIds.has(instance.spaceId) && espacioIds.size > 0) {
      return fail(
        "INVALID_SPACE_REF",
        `instancia ${id}: spaceId desconocido ${instance.spaceId}`,
      );
    }
  }

  for (const wall of document.walls) {
    const vals = [wall.x1, wall.y1, wall.x2, wall.y2];
    if (!vals.every(isFiniteNumber)) {
      return fail("INVALID_GEOMETRY", `pared ${wall.id}: coordenadas no finitas`);
    }
  }

  for (const el of document.structuralElements) {
    if (
      ![el.x, el.y, el.width, el.height].every(isFiniteNumber) ||
      el.width <= 0 ||
      el.height <= 0
    ) {
      return fail("INVALID_GEOMETRY", `estructural ${el.id}: geometría inválida`);
    }
  }

  for (const el of document.landscapeElements) {
    if (
      ![el.x, el.y, el.width, el.height].every(isFiniteNumber) ||
      el.width <= 0 ||
      el.height <= 0
    ) {
      return fail("INVALID_GEOMETRY", `landscape ${el.id}: geometría inválida`);
    }
  }

  return { ok: true, document };
}
