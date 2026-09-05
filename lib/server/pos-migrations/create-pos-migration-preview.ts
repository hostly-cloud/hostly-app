import type { Firestore } from "firebase-admin/firestore";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import type { PosMigrationPreview } from "@/lib/pos-migration/types";
import { loadCentralProductsAdmin } from "@/lib/server/menu-imports/load-central-products-admin";
import { parsePosExport } from "./parse-pos-export";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 1000;
const WRITE_CHUNK_SIZE = 400;

export class CreatePosMigrationPreviewError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "CreatePosMigrationPreviewError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function normalizeCategory(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function createPosMigrationPreview(params: {
  db: Firestore;
  restaurantId: string;
  userId: string;
  fileName: string;
  fileBytes: Uint8Array;
}): Promise<PosMigrationPreview> {
  const restaurantId = params.restaurantId.trim();
  const fileName = params.fileName.trim();
  if (!restaurantId) throw new CreatePosMigrationPreviewError("INVALID_RESTAURANT", "restaurantId requerido", 400);
  if (!fileName) throw new CreatePosMigrationPreviewError("MISSING_FILE_NAME", "Nombre de archivo requerido", 400);
  if (params.fileBytes.byteLength === 0) throw new CreatePosMigrationPreviewError("EMPTY_FILE", "El archivo está vacío", 400);
  if (params.fileBytes.byteLength > MAX_FILE_BYTES) {
    throw new CreatePosMigrationPreviewError("FILE_TOO_LARGE", "El archivo supera el límite de 4 MB", 413);
  }

  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (!["csv", "tsv", "txt"].includes(extension)) {
    throw new CreatePosMigrationPreviewError(
      "UNSUPPORTED_FILE_TYPE",
      "Esta primera versión acepta exportaciones CSV, TSV o TXT del TPV",
      415,
    );
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(params.fileBytes);
  let parsed: ReturnType<typeof parsePosExport>;
  try {
    parsed = parsePosExport({ text, fileName, maxRows: MAX_ROWS });
  } catch (error) {
    const code = error instanceof Error ? error.message : "POS_EXPORT_PARSE_FAILED";
    if (code === "POS_EXPORT_NAME_COLUMN_NOT_FOUND") {
      throw new CreatePosMigrationPreviewError(
        code,
        "No hemos podido identificar la columna de nombre del producto",
        422,
      );
    }
    if (code === "POS_EXPORT_EMPTY") {
      throw new CreatePosMigrationPreviewError(code, "No hay filas de productos para importar", 422);
    }
    throw new CreatePosMigrationPreviewError("POS_EXPORT_PARSE_FAILED", "No se pudo interpretar la exportación", 422);
  }

  const existingProducts = await loadCentralProductsAdmin(params.db, restaurantId);
  const existingByName = new Map<string, string>();
  for (const product of existingProducts) {
    const key = normalizeProductName(product.name);
    if (key && !existingByName.has(key)) existingByName.set(key, product.id);
  }

  const items = parsed.items.map((item) => {
    const existingProductId = item.name ? existingByName.get(normalizeProductName(item.name)) ?? null : null;
    if (!existingProductId) return item;
    const warnings = item.warnings.includes("Ya existe un producto con el mismo nombre en Hostly")
      ? item.warnings
      : [...item.warnings, "Ya existe un producto con el mismo nombre en Hostly"];
    return {
      ...item,
      existingProductId,
      decision: item.decision === "blocked" ? "blocked" as const : "review" as const,
      warnings,
    };
  });

  const categories = new Set(
    items.map((item) => item.category).filter((value): value is string => Boolean(value)).map(normalizeCategory),
  );
  const summary = {
    rowCount: items.length,
    createCount: items.filter((item) => item.decision === "create").length,
    reviewCount: items.filter((item) => item.decision === "review").length,
    blockedCount: items.filter((item) => item.decision === "blocked").length,
    categoryCount: categories.size,
    taxRateDetectedCount: items.filter((item) => item.taxRate != null).length,
    inventoryDetectedCount: items.filter((item) => item.stock != null || item.cost != null).length,
  };

  const warnings: string[] = [];
  if (items.length >= MAX_ROWS) warnings.push(`Se han analizado las primeras ${MAX_ROWS} filas del archivo.`);
  if (summary.taxRateDetectedCount > 0) {
    warnings.push("El IVA se conserva en el borrador para revisión, pero no se aplicará al producto hasta que exista un contrato fiscal canónico en Hostly.");
  }
  if (summary.reviewCount > 0) warnings.push("Las filas marcadas para revisión no se importarán automáticamente.");
  if (summary.blockedCount > 0) warnings.push("Las filas bloqueadas tienen datos inválidos y se omitirán.");

  const migrationRef = params.db.collection("restaurants").doc(restaurantId).collection("posMigrations").doc();
  const migrationId = migrationRef.id;
  const now = Date.now();
  await migrationRef.set({
    restaurantId,
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

  for (let offset = 0; offset < items.length; offset += WRITE_CHUNK_SIZE) {
    const batch = params.db.batch();
    for (const item of items.slice(offset, offset + WRITE_CHUNK_SIZE)) {
      batch.set(migrationRef.collection("items").doc(item.id), item);
    }
    await batch.commit();
  }

  return {
    migrationId,
    status: "preview",
    sourceFileName: fileName,
    sourceFormat: parsed.sourceFormat,
    mapping: parsed.mapping,
    items,
    summary,
    warnings,
  };
}
