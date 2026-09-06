import type {
  PosMigrationCandidate,
  PosMigrationColumnMapping,
  PosMigrationTargetField,
  PosMigrationVendor,
} from "@/lib/pos-migration/types";
import { detectPosVendor, mergeVendorAliases } from "./pos-vendor-adapters";

const BASE_FIELD_ALIASES: Record<PosMigrationTargetField, string[]> = {
  name: ["producto", "product", "articulo", "nombre", "descripcion", "item"],
  category: ["categoria", "category", "familia", "grupo", "department", "seccion"],
  price: ["precio", "pvp", "pvp1", "price", "venta", "retail", "precio venta"],
  taxRate: ["iva", "tax", "impuesto", "tax rate", "tipo iva", "vat"],
  cost: ["coste", "costo", "cost", "precio compra", "coste compra", "purchase cost"],
  stock: ["stock", "existencias", "cantidad", "current stock", "unidades"],
  unit: ["unidad", "unit", "medida", "uom"],
  station: ["estacion", "destino", "preparation area", "area", "cocina barra"],
  sku: ["sku", "referencia", "ref", "codigo", "code"],
  barcode: ["ean", "gtin", "barcode", "codigo barras", "codigo de barras"],
  active: ["activo", "active", "enabled", "habilitado"],
};

export type ParsedPosExport = {
  sourceFormat: "csv" | "tsv" | "txt";
  sourceVendor: PosMigrationVendor;
  sourceVendorLabel: string;
  sourceVendorConfidence: number;
  mapping: PosMigrationColumnMapping[];
  items: PosMigrationCandidate[];
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ");
}

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 5);
  const candidates = [";", "\t", ",", "|"];
  let best = ";";
  let bestScore = -1;
  for (const delimiter of candidates) {
    const counts = firstLines.map((line) => countDelimiterOutsideQuotes(line, delimiter));
    const nonZero = counts.filter((count) => count > 0);
    if (!nonZero.length) continue;
    const consistency = nonZero.filter((count) => count === nonZero[0]).length;
    const score = consistency * 100 + nonZero[0];
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && line[i] === delimiter) count += 1;
  }
  return count;
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
      continue;
    }
    if (!quoted && ch === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function inferField(header: string, aliases: Record<PosMigrationTargetField, string[]>): { field: PosMigrationTargetField | null; confidence: number } {
  const normalized = normalizeText(header);
  if (!normalized) return { field: null, confidence: 0 };
  for (const [field, fieldAliases] of Object.entries(aliases) as [PosMigrationTargetField, string[]][]) {
    const normalizedAliases = fieldAliases.map(normalizeText);
    if (normalizedAliases.includes(normalized)) return { field, confidence: 1 };
  }
  for (const [field, fieldAliases] of Object.entries(aliases) as [PosMigrationTargetField, string[]][]) {
    if (fieldAliases.some((alias) => normalized.includes(normalizeText(alias)))) return { field, confidence: 0.82 };
  }
  return { field: null, confidence: 0 };
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  let value = raw.trim().replace(/[€$£%\s]/g, "");
  if (!value) return null;
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma > lastDot) value = value.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) value = value.replace(/,/g, "");
  else if (lastComma >= 0) value = value.replace(",", ".");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(raw: string | undefined): boolean {
  if (!raw?.trim()) return true;
  const value = normalizeText(raw);
  return !["0", "no", "false", "inactivo", "disabled", "deshabilitado"].includes(value);
}

function normalizeUnit(raw: string | undefined): PosMigrationCandidate["unit"] {
  const unit = normalizeText(raw ?? "");
  if (["kg", "kilo", "kilogramo", "kilogramos"].includes(unit)) return "kg";
  if (["g", "gr", "gramo", "gramos"].includes(unit)) return "g";
  if (["l", "litro", "litros"].includes(unit)) return "l";
  if (["ml", "mililitro", "mililitros"].includes(unit)) return "ml";
  return "ud";
}

function safeText(raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  return value || null;
}

export function parsePosExport(args: { text: string; fileName: string; maxRows?: number }): ParsedPosExport {
  const normalizedText = args.text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(normalizedText);
  const rows = parseDelimitedRows(normalizedText, delimiter);
  if (rows.length < 2) throw new Error("POS_EXPORT_EMPTY");

  const headers = rows[0].map((header, index) => header.trim() || `Columna ${index + 1}`);
  const vendorMatch = detectPosVendor(headers, args.fileName);
  const aliases = mergeVendorAliases(BASE_FIELD_ALIASES, vendorMatch.adapter);
  const usedFields = new Set<PosMigrationTargetField>();
  const mapping = headers.map((sourceColumn) => {
    const inferred = inferField(sourceColumn, aliases);
    if (inferred.field && usedFields.has(inferred.field)) return { sourceColumn, targetField: null, confidence: 0 } satisfies PosMigrationColumnMapping;
    if (inferred.field) usedFields.add(inferred.field);
    return { sourceColumn, targetField: inferred.field, confidence: inferred.confidence } satisfies PosMigrationColumnMapping;
  });

  const indexByField = new Map<PosMigrationTargetField, number>();
  mapping.forEach((entry, index) => { if (entry.targetField) indexByField.set(entry.targetField, index); });
  if (!indexByField.has("name")) throw new Error("POS_EXPORT_NAME_COLUMN_NOT_FOUND");

  const maxRows = Math.max(1, Math.min(args.maxRows ?? 1000, 2000));
  const dataRows = rows.slice(1, maxRows + 1);
  const seenNames = new Map<string, number>();
  const items: PosMigrationCandidate[] = dataRows.map((row, index) => {
    const get = (field: PosMigrationTargetField) => {
      const column = indexByField.get(field);
      return column == null ? undefined : row[column];
    };
    const name = get("name")?.trim() ?? "";
    const normalizedName = normalizeText(name);
    const warnings: string[] = [];
    if (!name) warnings.push("Nombre vacío");
    if (normalizedName) {
      const occurrences = (seenNames.get(normalizedName) ?? 0) + 1;
      seenNames.set(normalizedName, occurrences);
      if (occurrences > 1) warnings.push("Nombre duplicado dentro del archivo");
    }
    const price = parseNumber(get("price"));
    if (indexByField.has("price") && price == null) warnings.push("Precio no válido");
    if (price != null && price < 0) warnings.push("Precio negativo");
    const taxRate = parseNumber(get("taxRate"));
    if (taxRate != null && (taxRate < 0 || taxRate > 100)) warnings.push("IVA fuera de rango");
    const cost = parseNumber(get("cost"));
    if (cost != null && cost < 0) warnings.push("Coste negativo");
    const stock = parseNumber(get("stock"));
    if (stock != null && stock < 0) warnings.push("Stock negativo");
    const blocked = !name || (price != null && price < 0) || (cost != null && cost < 0) || (stock != null && stock < 0);
    const review = !blocked && warnings.length > 0;
    return {
      id: `row-${index + 2}`,
      rowNumber: index + 2,
      name,
      category: safeText(get("category")),
      price,
      taxRate,
      cost,
      stock,
      unit: normalizeUnit(get("unit")),
      station: safeText(get("station")),
      sku: safeText(get("sku")),
      barcode: safeText(get("barcode")),
      active: parseBoolean(get("active")),
      decision: blocked ? "blocked" : review ? "review" : "create",
      warnings,
      existingProductId: null,
    };
  });

  const extension = args.fileName.toLowerCase().split(".").pop();
  const sourceFormat = extension === "tsv" || delimiter === "\t" ? "tsv" : extension === "txt" ? "txt" : "csv";
  return {
    sourceFormat,
    sourceVendor: vendorMatch.vendor,
    sourceVendorLabel: vendorMatch.label,
    sourceVendorConfidence: vendorMatch.confidence,
    mapping,
    items,
  };
}
