import type {
  ImportedMenuItem,
  ImportedMenuSection,
  ImportedMenuSourceType,
  ImportedMenuSuggestedStation,
} from "./imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";

type MockRow = {
  name: string;
  description?: string;
  price?: number;
  sectionName: string;
  suggestedCategory: string;
  suggestedStation: ImportedMenuSuggestedStation;
  confidence: number;
  rawText?: string;
  needsReview?: boolean;
};

const MOCK_SECTION_ROWS: MockRow[] = [
  { sectionName: "Vinos tintos", name: "Rioja Crianza", price: 18, suggestedCategory: "Vinos tintos", suggestedStation: "bar", confidence: 92 },
  { sectionName: "Vinos tintos", name: "Ribera Reserva", price: 22, suggestedCategory: "Vinos tintos", suggestedStation: "bar", confidence: 88 },
  { sectionName: "Vinos tintos", name: "Syrah (copas)", price: 4.5, suggestedCategory: "Vinos por copa", suggestedStation: "bar", confidence: 74, needsReview: true },
  { sectionName: "Vinos blancos", name: "Albariño", price: 19, suggestedCategory: "Vinos blancos", suggestedStation: "bar", confidence: 91 },
  { sectionName: "Vinos blancos", name: "Verdejo", price: 16, suggestedCategory: "Vinos blancos", suggestedStation: "bar", confidence: 89 },
  { sectionName: "Vinos blancos", name: "Blanco de la casa", price: 14, suggestedCategory: "Vinos blancos", suggestedStation: "bar", confidence: 62, needsReview: true, rawText: "Blanco casa 14€" },
  { sectionName: "Cócteles", name: "Gin Tonic premium", price: 11, suggestedCategory: "Cócteles", suggestedStation: "cocktail", confidence: 95 },
  { sectionName: "Cócteles", name: "Mojito", price: 9.5, suggestedCategory: "Cócteles", suggestedStation: "cocktail", confidence: 93 },
  { sectionName: "Cócteles", name: "Negroni", price: 10.5, suggestedCategory: "Cócteles", suggestedStation: "cocktail", confidence: 86 },
  { sectionName: "Entrantes", name: "Ensaladilla rusa", price: 8.5, suggestedCategory: "Entrantes fríos", suggestedStation: "kitchen", confidence: 94 },
  { sectionName: "Entrantes", name: "Croquetas caseras", price: 9, suggestedCategory: "Entrantes calientes", suggestedStation: "kitchen", confidence: 90 },
  { sectionName: "Entrantes", name: "Pan con tomate", price: 4.5, suggestedCategory: "Entrantes", suggestedStation: "kitchen", confidence: 78, needsReview: true },
  { sectionName: "Principales", name: "Entrecot a la brasa", price: 24, suggestedCategory: "Carnes", suggestedStation: "kitchen", confidence: 91 },
  { sectionName: "Principales", name: "Lubina al horno", price: 19.5, suggestedCategory: "Pescados", suggestedStation: "kitchen", confidence: 88 },
  { sectionName: "Principales", name: "Paella (mín. 2)", price: 16, suggestedCategory: "Arroces", suggestedStation: "kitchen", confidence: 71, needsReview: true, description: "Precio por persona" },
];

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

export function groupMockRowsIntoSections(
  rows: MockRow[],
  sourceType: ImportedMenuSourceType,
): ImportedMenuSection[] {
  const bySection = new Map<string, ImportedMenuItem[]>();
  const order: string[] = [];

  for (const row of rows) {
    if (!bySection.has(row.sectionName)) {
      bySection.set(row.sectionName, []);
      order.push(row.sectionName);
    }
    bySection.get(row.sectionName)!.push({
      id: uid("item"),
      sourceType,
      name: row.name,
      description: row.description,
      price: row.price,
      sectionName: row.sectionName,
      suggestedCategory: row.suggestedCategory,
      suggestedStation: row.suggestedStation,
      confidence: row.confidence,
      rawText: row.rawText,
      needsReview: row.needsReview ?? row.confidence < 80,
      selectedForPublish: !(row.needsReview ?? row.confidence < 80),
    });
  }

  return order.map((name) => ({
    id: uid("section"),
    name,
    items: bySection.get(name) ?? [],
  }));
}

export function flattenMenuImportSections(sections: ImportedMenuSection[]): ImportedMenuItem[] {
  return sections.flatMap((s) => s.items);
}

export type MockMenuImportExtractionInput = {
  sourceType: ImportedMenuSourceType;
  menuType: MenuImportMenuType;
  storagePath?: string;
  sourceUrl?: string;
  originalFileName?: string;
};

export type MockMenuImportExtractionResult = {
  rawText: string;
  sections: ImportedMenuSection[];
  items: ImportedMenuItem[];
};

function buildSimulatedRawText(input: MockMenuImportExtractionInput): string {
  if (input.sourceType === "qr_url" && input.sourceUrl?.trim()) {
    return `[mock-qr] Texto simulado extraído del menú digital en ${input.sourceUrl.trim()}`;
  }
  const label = input.originalFileName?.trim() || input.storagePath?.trim() || "archivo";
  if (input.sourceType === "pdf") {
    return `[mock-ocr] Texto simulado extraído del PDF "${label}"`;
  }
  return `[mock-ocr] Texto simulado extraído de la imagen "${label}"`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracción simulada (servidor). Sustituir por OCR / parser QR real.
 */
export async function mockExtractMenuImportContent(
  input: MockMenuImportExtractionInput,
): Promise<MockMenuImportExtractionResult> {
  void input.menuType;
  await delay(900 + Math.random() * 600);

  const sections = groupMockRowsIntoSections(MOCK_SECTION_ROWS, input.sourceType);
  return {
    rawText: buildSimulatedRawText(input),
    sections,
    items: flattenMenuImportSections(sections),
  };
}
