import type {
  PosLayoutCandidate,
  PosLayoutColumnMapping,
  PosLayoutTargetField,
} from "@/lib/pos-migration/layout-types";

const FIELD_ALIASES: Record<PosLayoutTargetField, string[]> = {
  name: ["mesa", "table", "nombre mesa", "table name", "name"],
  floorPlan: ["plano", "sala", "floor plan", "floorplan", "room", "area principal"],
  zone: ["zona", "zone", "seccion", "section", "area"],
  seats: ["comensales", "asientos", "seats", "covers", "capacity", "capacidad"],
  x: ["x", "pos x", "position x", "left"],
  y: ["y", "pos y", "position y", "top"],
  width: ["ancho", "width", "w"],
  height: ["alto", "height", "h"],
  shape: ["forma", "shape", "table shape"],
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ");
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

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 5);
  const candidates = [";", "\t", ",", "|"];
  let best = ";";
  let score = -1;
  for (const delimiter of candidates) {
    const counts = lines.map((line) => countDelimiterOutsideQuotes(line, delimiter));
    const nonZero = counts.filter((value) => value > 0);
    if (!nonZero.length) continue;
    const consistency = nonZero.filter((value) => value === nonZero[0]).length;
    const current = consistency * 100 + nonZero[0];
    if (current > score) {
      score = current;
      best = delimiter;
    }
  }
  return best;
}

function parseRows(text: string, delimiter: string): string[][] {
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
    if (!quoted && (ch === "\r" || ch === "\n")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function inferField(header: string): { field: PosLayoutTargetField | null; confidence: number } {
  const n = normalize(header);
  if (!n) return { field: null, confidence: 0 };
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [PosLayoutTargetField, string[]][]) {
    const normalizedAliases = aliases.map(normalize);
    if (normalizedAliases.includes(n)) return { field, confidence: 1 };
  }
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [PosLayoutTargetField, string[]][]) {
    if (aliases.some((alias) => n.includes(normalize(alias)))) return { field, confidence: 0.82 };
  }
  return { field: null, confidence: 0 };
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const value = raw.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseSeats(raw: string | undefined): number {
  const n = parseNumber(raw);
  if (n == null) return 4;
  return Math.max(1, Math.min(20, Math.round(n)));
}

function parseShape(raw: string | undefined): PosLayoutCandidate["shape"] {
  const n = normalize(raw ?? "");
  if (n.includes("redond") || n.includes("round") || n.includes("circle")) return "round";
  if (n.includes("rect")) return "rect";
  return "square";
}

function planSuffix(planName: string): string {
  const words = normalize(planName).split(" ").filter(Boolean);
  if (!words.length) return "P";
  return words.map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function uniqueTableName(sourceName: string, floorPlanName: string, used: Set<string>): { name: string; renamed: boolean } {
  const baseKey = normalize(sourceName);
  if (baseKey && !used.has(baseKey)) {
    used.add(baseKey);
    return { name: sourceName, renamed: false };
  }

  const suffix = planSuffix(floorPlanName);
  const numberMatch = sourceName.match(/^(.*?)(\d+)\s*$/);
  const firstCandidate = numberMatch
    ? `${numberMatch[1]}${numberMatch[2]}${suffix}`.replace(/\s+/g, " ").trim()
    : `${sourceName} ${suffix}`.trim();
  if (!used.has(normalize(firstCandidate))) {
    used.add(normalize(firstCandidate));
    return { name: firstCandidate, renamed: true };
  }

  for (let i = 2; i <= 99; i += 1) {
    const candidate = `${firstCandidate}${i}`;
    if (!used.has(normalize(candidate))) {
      used.add(normalize(candidate));
      return { name: candidate, renamed: true };
    }
  }
  return { name: `${firstCandidate}-${Date.now()}`, renamed: true };
}

export function parseLayoutExport(args: {
  text: string;
  fileName: string;
  existingTableNames?: string[];
  maxRows?: number;
}): {
  sourceFormat: "csv" | "tsv" | "txt";
  mapping: PosLayoutColumnMapping[];
  items: PosLayoutCandidate[];
} {
  const text = args.text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const rows = parseRows(text, delimiter);
  if (rows.length < 2) throw new Error("POS_LAYOUT_EXPORT_EMPTY");

  const headers = rows[0].map((value, index) => value.trim() || `Columna ${index + 1}`);
  const usedFields = new Set<PosLayoutTargetField>();
  const mapping = headers.map((sourceColumn) => {
    const inferred = inferField(sourceColumn);
    if (inferred.field && usedFields.has(inferred.field)) {
      return { sourceColumn, targetField: null, confidence: 0 } satisfies PosLayoutColumnMapping;
    }
    if (inferred.field) usedFields.add(inferred.field);
    return { sourceColumn, targetField: inferred.field, confidence: inferred.confidence } satisfies PosLayoutColumnMapping;
  });
  const indexByField = new Map<PosLayoutTargetField, number>();
  mapping.forEach((entry, index) => {
    if (entry.targetField) indexByField.set(entry.targetField, index);
  });
  if (!indexByField.has("name")) throw new Error("POS_LAYOUT_NAME_COLUMN_NOT_FOUND");

  const usedNames = new Set((args.existingTableNames ?? []).map(normalize).filter(Boolean));
  const maxRows = Math.max(1, Math.min(args.maxRows ?? 500, 1000));
  const items = rows.slice(1, maxRows + 1).map((row, index) => {
    const get = (field: PosLayoutTargetField) => {
      const column = indexByField.get(field);
      return column == null ? undefined : row[column];
    };
    const sourceName = get("name")?.trim() ?? "";
    const floorPlanName = get("floorPlan")?.trim() || "Principal";
    const zoneName = get("zone")?.trim() || floorPlanName;
    const warnings: string[] = [];
    const x = parseNumber(get("x"));
    const y = parseNumber(get("y"));
    const width = parseNumber(get("width"));
    const height = parseNumber(get("height"));
    if (!sourceName) warnings.push("Nombre de mesa vacío");
    if (width != null && width <= 0) warnings.push("Ancho inválido");
    if (height != null && height <= 0) warnings.push("Alto inválido");
    const blocked = !sourceName || (width != null && width <= 0) || (height != null && height <= 0);
    const unique = sourceName ? uniqueTableName(sourceName, floorPlanName, usedNames) : { name: sourceName, renamed: false };
    if (unique.renamed) warnings.push(`Nombre ajustado para evitar duplicados: ${unique.name}`);
    return {
      id: `layout-row-${index + 2}`,
      rowNumber: index + 2,
      sourceName,
      finalName: unique.name,
      floorPlanName,
      zoneName,
      seats: parseSeats(get("seats")),
      x,
      y,
      width,
      height,
      shape: parseShape(get("shape")),
      decision: blocked ? "blocked" : unique.renamed ? "review" : "create",
      warnings,
    } satisfies PosLayoutCandidate;
  });

  const extension = args.fileName.toLowerCase().split(".").pop();
  const sourceFormat = extension === "tsv" || delimiter === "\t" ? "tsv" : extension === "txt" ? "txt" : "csv";
  return { sourceFormat, mapping, items };
}
