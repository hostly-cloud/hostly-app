import type {
  ImportedMenuInferredAttributes,
  ImportedMenuItem,
  ImportedMenuSuggestedStation,
} from "@/lib/carta/imported-menu-types";
import {
  isProductNameSupportedByOcr,
  normalizeForOcrMatch,
} from "@/lib/server/menu-imports/validate-items-against-ocr";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";
import { resolveImportSelectedForPublish } from "./evaluate-import-item-for-publish";
import { resolveImportedItemDestination } from "./resolve-imported-item-destination";

const AI_TIMEOUT_MS = 25_000;
const MAX_RAW_TEXT_FOR_AI = 8_000;
const MAX_ITEMS_FOR_AI = 80;

const STATIONS: ImportedMenuSuggestedStation[] = ["kitchen", "bar", "cocktail", "none"];

const ENRICHMENT_JSON_SCHEMA = {
  name: "menu_import_enrichment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            itemId: { type: "string" },
            normalizedName: { type: "string" },
            suggestedCategory: { type: "string" },
            suggestedStation: { type: "string", enum: STATIONS },
            inferredAttributes: {
              type: "object",
              additionalProperties: false,
              properties: {
                wineByGlass: { type: "boolean" },
                bottle: { type: "boolean" },
                spicy: { type: "boolean" },
                vegetarian: { type: "boolean" },
                vegan: { type: "boolean" },
                cocktail: { type: "boolean" },
                coffee: { type: "boolean" },
              },
              required: [
                "wineByGlass",
                "bottle",
                "spicy",
                "vegetarian",
                "vegan",
                "cocktail",
                "coffee",
              ],
            },
            duplicateOfItemId: { type: "string" },
            confidenceAdjusted: { type: "number" },
            warnings: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "itemId",
            "normalizedName",
            "suggestedCategory",
            "suggestedStation",
            "inferredAttributes",
            "duplicateOfItemId",
            "confidenceAdjusted",
            "warnings",
          ],
        },
      },
      globalWarnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["items", "globalWarnings"],
  },
} as const;

type AiEnrichmentRow = {
  itemId: string;
  normalizedName: string;
  suggestedCategory: string;
  suggestedStation: ImportedMenuSuggestedStation;
  inferredAttributes: Required<ImportedMenuInferredAttributes>;
  duplicateOfItemId: string;
  confidenceAdjusted: number;
  warnings: string[];
};

type AiEnrichmentPayload = {
  items: AiEnrichmentRow[];
  globalWarnings: string[];
};

export type EnrichMenuItemsInput = {
  rawText: string;
  items: ImportedMenuItem[];
  menuType: MenuImportMenuType;
  knownCategories: string[];
  parserWarnings: string[];
};

export type EnrichMenuItemsResult = {
  items: ImportedMenuItem[];
  aiWarnings: string[];
  enriched: boolean;
};

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function truncateRawText(rawText: string): string {
  const t = rawText.trim();
  if (t.length <= MAX_RAW_TEXT_FOR_AI) return t;
  return `${t.slice(0, MAX_RAW_TEXT_FOR_AI)}\n\n[… texto truncado para IA …]`;
}

function namesAreEquivalentOcr(a: string, b: string): boolean {
  const na = normalizeForOcrMatch(a);
  const nb = normalizeForOcrMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function buildPrompt(input: EnrichMenuItemsInput): string {
  const itemsForPrompt = input.items.slice(0, MAX_ITEMS_FOR_AI).map((item) => ({
    itemId: item.id,
    name: item.name,
    price: item.price ?? null,
    sectionName: item.sectionName,
    suggestedCategory: item.suggestedCategory,
    suggestedStation: item.suggestedStation,
    confidence: item.confidence,
    rawText: item.rawText ?? null,
  }));

  return [
    "Eres un asistente de estructuración de cartas para un TPV SaaS.",
    "FASE 1 ya está hecha: parsedItems vienen de OCR/heurística. Tu trabajo es FASE 2 — enriquecer SIN renombrar.",
    "",
    "REGLAS ESTRICTAS (OCR fiel):",
    "- NO inventes productos, precios ni descripciones.",
    "- NO añadas items que no estén en parsedItems.",
    "- normalizedName DEBE ser idéntico al name del parsedItem salvo corrección mínima de OCR (espacios/tildes).",
    "- NO traduzcas, NO reformules, NO embellezcas nombres comerciales (italiano/español tal cual).",
    "- NO completes palabras ilegibles: baja confidenceAdjusted y avisa en warnings.",
    "- Si el nombre es dudoso, confidenceAdjusted < 65 y warning 'nombre_dudoso'.",
    "",
    "Puedes ajustar suggestedCategory y suggestedStation usando knownCategories y rawText.",
    "duplicateOfItemId: id de otro item duplicado probable, o cadena vacía.",
    "confidenceAdjusted: 0-100 según claridad del OCR para ese item.",
    "",
    `menuType: ${input.menuType}`,
    `knownCategories: ${JSON.stringify(input.knownCategories.slice(0, 40))}`,
    `parserWarnings: ${JSON.stringify(input.parserWarnings.slice(0, 12))}`,
    "",
    "parsedItems:",
    JSON.stringify(itemsForPrompt),
    "",
    "rawText (OCR, referencia obligatoria — no inventes fuera de aquí):",
    truncateRawText(input.rawText),
  ].join("\n");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("OpenAI enrichment timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function parseAttributes(raw: AiEnrichmentRow["inferredAttributes"]): ImportedMenuInferredAttributes | undefined {
  const out: ImportedMenuInferredAttributes = {};
  if (raw.wineByGlass) out.wineByGlass = true;
  if (raw.bottle) out.bottle = true;
  if (raw.spicy) out.spicy = true;
  if (raw.vegetarian) out.vegetarian = true;
  if (raw.vegan) out.vegan = true;
  if (raw.cocktail) out.cocktail = true;
  if (raw.coffee) out.coffee = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

function mergeEnrichmentRow(
  item: ImportedMenuItem,
  row: AiEnrichmentRow,
  validIds: Set<string>,
  rawText: string,
): ImportedMenuItem {
  const duplicateOf =
    row.duplicateOfItemId.trim() && row.duplicateOfItemId !== item.id && validIds.has(row.duplicateOfItemId)
      ? row.duplicateOfItemId.trim()
      : undefined;

  const normalizedName = row.normalizedName.trim();
  const name = item.name;
  const renameRejected =
    normalizedName.length >= 2 &&
    normalizedName !== item.name &&
    !namesAreEquivalentOcr(normalizedName, item.name);

  const aiConfidence = clampConfidence(row.confidenceAdjusted);
  const aiWarnings = row.warnings.map((w) => w.trim()).filter(Boolean).slice(0, 6);
  if (renameRejected) {
    aiWarnings.unshift("nombre_ia_rechazado");
  }
  const needsReview =
    item.needsReview ||
    aiConfidence < 75 ||
    aiWarnings.length > 0 ||
    duplicateOf != null ||
    renameRejected ||
    !isProductNameSupportedByOcr(name, rawText);

  const aiCategory = row.suggestedCategory.trim() || item.suggestedCategory;
  const aiStation = STATIONS.includes(row.suggestedStation) ? row.suggestedStation : item.suggestedStation;

  return {
    ...item,
    name,
    suggestedCategory: aiCategory,
    suggestedStation: resolveImportedItemDestination({
      name,
      sectionName: item.sectionName,
      suggestedCategory: aiCategory,
      fallbackStation: aiStation,
    }),
    confidence: aiConfidence,
    inferredAttributes: parseAttributes(row.inferredAttributes),
    duplicateOf,
    aiWarnings: aiWarnings.length > 0 ? aiWarnings : undefined,
    aiConfidence,
    aiEnriched: true,
    needsReview,
    selectedForPublish: resolveImportSelectedForPublish(item, needsReview, renameRejected),
  };
}

function validatePayload(raw: unknown, validIds: Set<string>): AiEnrichmentPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.items)) return null;

  const items: AiEnrichmentRow[] = [];
  for (const entry of rec.items) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const itemId = typeof r.itemId === "string" ? r.itemId.trim() : "";
    if (!itemId || !validIds.has(itemId)) continue;

    const station = r.suggestedStation;
    if (station !== "kitchen" && station !== "bar" && station !== "cocktail" && station !== "none") {
      continue;
    }

    const attrs = r.inferredAttributes;
    if (!attrs || typeof attrs !== "object") continue;

    const a = attrs as Record<string, unknown>;
    const inferredAttributes: Required<ImportedMenuInferredAttributes> = {
      wineByGlass: a.wineByGlass === true,
      bottle: a.bottle === true,
      spicy: a.spicy === true,
      vegetarian: a.vegetarian === true,
      vegan: a.vegan === true,
      cocktail: a.cocktail === true,
      coffee: a.coffee === true,
    };

    items.push({
      itemId,
      normalizedName: typeof r.normalizedName === "string" ? r.normalizedName : "",
      suggestedCategory: typeof r.suggestedCategory === "string" ? r.suggestedCategory : "",
      suggestedStation: station,
      inferredAttributes,
      duplicateOfItemId: typeof r.duplicateOfItemId === "string" ? r.duplicateOfItemId : "",
      confidenceAdjusted:
        typeof r.confidenceAdjusted === "number" && Number.isFinite(r.confidenceAdjusted)
          ? r.confidenceAdjusted
          : 50,
      warnings: Array.isArray(r.warnings)
        ? r.warnings.filter((w): w is string => typeof w === "string")
        : [],
    });
  }

  const globalWarnings = Array.isArray(rec.globalWarnings)
    ? rec.globalWarnings.filter((w): w is string => typeof w === "string").map((w) => w.trim()).filter(Boolean)
    : [];

  return { items, globalWarnings };
}

async function callOpenAiEnrichment(prompt: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const model = process.env.HOSTLY_OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const res = await withTimeout(
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "Devuelve únicamente JSON válido según el schema. No inventes precios ni productos nuevos.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: ENRICHMENT_JSON_SCHEMA,
        },
      }),
    }),
    AI_TIMEOUT_MS,
  );

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${bodyText.slice(0, 240)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error("OpenAI response invalid JSON envelope");
  }

  const content = (parsed as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
    ?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI empty enrichment content");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error("OpenAI enrichment malformed JSON");
  }

  return payload;
}

/**
 * Enriquece items parseados con IA estructurada. Fallback silencioso al parser heurístico.
 */
export async function enrichMenuItemsWithAI(input: EnrichMenuItemsInput): Promise<EnrichMenuItemsResult> {
  if (input.items.length === 0) {
    return { items: input.items, aiWarnings: ["Sin items para enriquecer con IA"], enriched: false };
  }

  const validIds = new Set(input.items.map((i) => i.id));

  try {
    const prompt = buildPrompt(input);
    const rawPayload = await callOpenAiEnrichment(prompt);
    const payload = validatePayload(rawPayload, validIds);

    if (!payload || payload.items.length === 0) {
      return {
        items: input.items,
        aiWarnings: ["IA devolvió schema vacío; se mantiene parser heurístico"],
        enriched: false,
      };
    }

    const byId = new Map(payload.items.map((r) => [r.itemId, r]));
    const enrichedItems = input.items.map((item) => {
      const row = byId.get(item.id);
      if (!row) return item;
      return mergeEnrichmentRow(item, row, validIds, input.rawText);
    });

    const aiWarnings = [...payload.globalWarnings];
    if (input.items.length > MAX_ITEMS_FOR_AI) {
      aiWarnings.push(`IA aplicada solo a los primeros ${MAX_ITEMS_FOR_AI} items`);
    }

    return {
      items: enrichedItems,
      aiWarnings,
      enriched: true,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Enrichment failed";
    return {
      items: input.items,
      aiWarnings: [`Enriquecimiento IA omitido: ${message}`],
      enriched: false,
    };
  }
}
