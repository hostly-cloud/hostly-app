import type { Firestore } from "firebase-admin/firestore";
import type { PosLayoutPreview } from "@/lib/pos-migration/layout-types";
import { parseLayoutExport } from "./parse-layout-export";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 500;
const WRITE_CHUNK_SIZE = 350;

export class CreatePosLayoutPreviewError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "CreatePosLayoutPreviewError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function createPosLayoutPreview(params: {
  db: Firestore;
  restaurantId: string;
  userId: string;
  fileName: string;
  fileBytes: Uint8Array;
}): Promise<PosLayoutPreview> {
  const restaurantId = params.restaurantId.trim();
  const fileName = params.fileName.trim();
  if (!restaurantId) throw new CreatePosLayoutPreviewError("INVALID_RESTAURANT", "restaurantId requerido", 400);
  if (!fileName) throw new CreatePosLayoutPreviewError("MISSING_FILE_NAME", "Nombre de archivo requerido", 400);
  if (params.fileBytes.byteLength === 0) throw new CreatePosLayoutPreviewError("EMPTY_FILE", "El archivo está vacío", 400);
  if (params.fileBytes.byteLength > MAX_FILE_BYTES) {
    throw new CreatePosLayoutPreviewError("FILE_TOO_LARGE", "El archivo supera el límite de 4 MB", 413);
  }
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (!["csv", "tsv", "txt"].includes(extension)) {
    throw new CreatePosLayoutPreviewError("UNSUPPORTED_FILE_TYPE", "Sube las mesas en CSV, TSV o TXT", 415);
  }

  const existingTablesSnap = await params.db.collection("tables").where("restaurantId", "==", restaurantId).get();
  const existingTableNames = existingTablesSnap.docs
    .map((doc) => doc.data().name)
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const text = new TextDecoder("utf-8", { fatal: false }).decode(params.fileBytes);

  let parsed: ReturnType<typeof parseLayoutExport>;
  try {
    parsed = parseLayoutExport({ text, fileName, existingTableNames, maxRows: MAX_ROWS });
  } catch (error) {
    const code = error instanceof Error ? error.message : "POS_LAYOUT_PARSE_FAILED";
    if (code === "POS_LAYOUT_NAME_COLUMN_NOT_FOUND") {
      throw new CreatePosLayoutPreviewError(code, "No hemos podido identificar la columna de nombre de mesa", 422);
    }
    if (code === "POS_LAYOUT_EXPORT_EMPTY") {
      throw new CreatePosLayoutPreviewError(code, "No hay mesas para importar", 422);
    }
    throw new CreatePosLayoutPreviewError("POS_LAYOUT_PARSE_FAILED", "No se pudo interpretar el plano exportado", 422);
  }

  const floorPlans = new Set(parsed.items.filter((item) => item.decision !== "blocked").map((item) => normalize(item.floorPlanName)));
  const zones = new Set(
    parsed.items
      .filter((item) => item.decision !== "blocked")
      .map((item) => `${normalize(item.floorPlanName)}::${normalize(item.zoneName)}`),
  );
  const summary = {
    rowCount: parsed.items.length,
    createCount: parsed.items.filter((item) => item.decision === "create").length,
    reviewCount: parsed.items.filter((item) => item.decision === "review").length,
    blockedCount: parsed.items.filter((item) => item.decision === "blocked").length,
    floorPlanCount: floorPlans.size,
    zoneCount: zones.size,
    renamedCount: parsed.items.filter((item) => item.finalName !== item.sourceName).length,
  };
  const warnings: string[] = [];
  if (summary.renamedCount > 0) warnings.push("Algunas mesas se han renombrado para mantener nombres únicos en todo el restaurante.");
  if (summary.reviewCount > 0) warnings.push("Confirma expresamente las mesas renombradas antes de publicarlas.");
  if (parsed.items.length >= MAX_ROWS) warnings.push(`Se han analizado las primeras ${MAX_ROWS} mesas.`);

  const migrationRef = params.db.collection("restaurants").doc(restaurantId).collection("posMigrations").doc();
  const migrationId = migrationRef.id;
  const now = Date.now();
  await migrationRef.set({
    restaurantId,
    migrationKind: "layout",
    status: "preview",
    sourceFileName: fileName,
    sourceFormat: parsed.sourceFormat,
    mapping: parsed.mapping,
    summary,
    warnings,
    createdAt: now,
    updatedAt: now,
    createdBy: params.userId,
    updatedBy: params.userId,
  });

  for (let offset = 0; offset < parsed.items.length; offset += WRITE_CHUNK_SIZE) {
    const batch = params.db.batch();
    for (const item of parsed.items.slice(offset, offset + WRITE_CHUNK_SIZE)) {
      batch.set(migrationRef.collection("layoutItems").doc(item.id), item);
    }
    await batch.commit();
  }

  return {
    migrationId,
    status: "preview",
    migrationKind: "layout",
    sourceFileName: fileName,
    sourceFormat: parsed.sourceFormat,
    mapping: parsed.mapping,
    items: parsed.items,
    summary,
    warnings,
  };
}
