import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { generateText } from "ai";
import type {
  SommelierCatalogItem,
  SommelierPairing,
  SommelierPairingSource,
  SommelierSnapshot,
  SommelierWineProfile,
} from "@/lib/sommelier/sommelier-types";

const DEFAULT_MODEL = "openai/gpt-5-mini";
const MAX_WINES = 80;
const MAX_DISHES = 180;
const MAX_PAIRINGS = 240;
const PAIRINGS_PER_DISH = 3;
const COLLECTION = "sommelierPairings";
const META_DOC = "_meta";

function cleanText(value: unknown, max = 240): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function finitePrice(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const WINE_SIGNALS = [
  "vino",
  "wine",
  "tinto",
  "blanco",
  "rosado",
  "rose",
  "champagne",
  "champan",
  "cava",
  "prosecco",
  "vermouth",
  "jerez",
  "sherry",
  "riesling",
  "chardonnay",
  "sauvignon",
  "verdejo",
  "albari",
  "tempranillo",
  "garnacha",
  "merlot",
  "cabernet",
  "pinot",
  "syrah",
];

function isWine(data: Record<string, unknown>): boolean {
  const haystack = normalizeSearch(
    [
      cleanText(data.name),
      cleanText(data.nombre),
      cleanText(data.categoryName),
      cleanText(data.categoria),
      cleanText(data.productFamilyName),
      cleanText(data.familyName),
    ].join(" "),
  );
  return WINE_SIGNALS.some((signal) => haystack.includes(signal));
}

function isDish(data: Record<string, unknown>): boolean {
  const tipoVenta = cleanText(data.tipoVenta).toLowerCase();
  const familyType = cleanText(data.productFamilyType).toLowerCase();
  const type = cleanText(data.type).toLowerCase();
  if (tipoVenta === "plato" || familyType === "food") return true;
  if (tipoVenta === "bebida" || familyType === "drink") return false;
  return type !== "inventory" && !isWine(data);
}

function toCatalogItem(
  id: string,
  data: Record<string, unknown>,
  kind: "wine" | "dish",
): SommelierCatalogItem | null {
  const name = cleanText(data.name) || cleanText(data.nombre);
  if (!name) return null;
  return {
    id,
    name,
    categoryName: cleanText(data.categoryName) || cleanText(data.categoria) || "Sin categoría",
    familyName: cleanText(data.productFamilyName) || cleanText(data.familyName) || "",
    price: finitePrice(data.price ?? data.precio),
    description: cleanText(data.description ?? data.descripcion, 500) || null,
    kind,
  };
}

export async function loadSommelierCatalog(params: {
  db: Firestore;
  restaurantId: string;
}): Promise<{ wines: SommelierCatalogItem[]; dishes: SommelierCatalogItem[]; catalogHash: string }> {
  const snap = await params.db
    .collection("restaurants")
    .doc(params.restaurantId)
    .collection("products")
    .get();
  const wines: SommelierCatalogItem[] = [];
  const dishes: SommelierCatalogItem[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.active === false || data.visibleOnMenu === false) continue;
    if (isWine(data)) {
      const item = toCatalogItem(doc.id, data, "wine");
      if (item) wines.push(item);
    } else if (isDish(data)) {
      const item = toCatalogItem(doc.id, data, "dish");
      if (item) dishes.push(item);
    }
  }

  wines.sort((a, b) => a.name.localeCompare(b.name, "es"));
  dishes.sort((a, b) => a.name.localeCompare(b.name, "es"));
  const trimmedWines = wines.slice(0, MAX_WINES);
  const trimmedDishes = dishes.slice(0, MAX_DISHES);
  const digest = createHash("sha256")
    .update(
      JSON.stringify(
        [...trimmedWines, ...trimmedDishes].map((item) => [
          item.id,
          item.name,
          item.categoryName,
          item.familyName,
          item.price,
          item.description,
        ]),
      ),
    )
    .digest("hex")
    .slice(0, 24);
  return { wines: trimmedWines, dishes: trimmedDishes, catalogHash: digest };
}

function wineStyle(item: SommelierCatalogItem): SommelierWineProfile["style"] {
  const text = normalizeSearch(`${item.name} ${item.categoryName} ${item.familyName}`);
  if (/champagne|champan|cava|prosecco|espum/.test(text)) return "sparkling";
  if (/rosado|rose/.test(text)) return "rose";
  if (/blanco|white|verdejo|albarino|chardonnay|sauvignon|riesling/.test(text)) return "white";
  if (/dulce|sweet|moscatel|pedro ximenez/.test(text)) return "sweet";
  if (/jerez|sherry|porto|port /.test(`${text} `)) return "fortified";
  if (/tinto|red|tempranillo|garnacha|merlot|cabernet|pinot noir|syrah/.test(text)) return "red";
  return "unknown";
}

function fallbackWineProfile(item: SommelierCatalogItem): SommelierWineProfile {
  const style = wineStyle(item);
  return {
    style,
    body: style === "red" ? "medium" : style === "white" || style === "rose" ? "light" : "unknown",
    sweetness: style === "sweet" ? "sweet" : style === "fortified" ? "unknown" : "dry",
    grapes: [],
    notes: [],
    confidence: style === "unknown" ? 0.25 : 0.65,
  };
}

function dishSignals(item: SommelierCatalogItem) {
  const text = normalizeSearch(`${item.name} ${item.categoryName} ${item.familyName} ${item.description ?? ""}`);
  return {
    meat: /carne|ternera|buey|cordero|cerdo|steak|entrecot|solomillo|hamburg/.test(text),
    fish: /pescado|lubina|bacalao|atun|salmon|merluza|fish/.test(text),
    seafood: /marisco|gamba|langost|ostra|mejillon|pulpo|calamar|seafood/.test(text),
    cheese: /queso|cheese/.test(text),
    pasta: /pasta|pizza|risotto|arroz/.test(text),
    salad: /ensalada|salad|vegetal|verdura/.test(text),
    dessert: /postre|tarta|chocolate|helado|dessert|dulce/.test(text),
    spicy: /picante|spicy|curry|chili|thai/.test(text),
  };
}

function heuristicScore(wine: SommelierCatalogItem, dish: SommelierCatalogItem): number {
  const style = wineStyle(wine);
  const signals = dishSignals(dish);
  let score = 62;
  if (signals.meat && style === "red") score += 24;
  if ((signals.fish || signals.seafood) && style === "white") score += 24;
  if (signals.cheese && (style === "red" || style === "sparkling")) score += 16;
  if (signals.salad && (style === "white" || style === "rose")) score += 17;
  if (signals.pasta && (style === "red" || style === "white")) score += 12;
  if (signals.dessert && (style === "sweet" || style === "sparkling")) score += 22;
  if (signals.spicy && (style === "white" || style === "rose" || style === "sparkling")) score += 14;
  if (signals.dessert && style === "red") score -= 12;
  if ((signals.fish || signals.seafood) && style === "red") score -= 9;
  return Math.max(35, Math.min(94, score));
}

function heuristicReason(wine: SommelierCatalogItem, dish: SommelierCatalogItem): string {
  const style = wineStyle(wine);
  const labels: Record<SommelierWineProfile["style"], string> = {
    red: "perfil tinto",
    white: "perfil blanco",
    rose: "perfil rosado",
    sparkling: "frescura y burbuja",
    sweet: "perfil dulce",
    fortified: "intensidad de vino generoso",
    unknown: "equilibrio de intensidad",
  };
  return `${wine.name} encaja con ${dish.name} por ${labels[style]}; recomendación orientativa basada en la carta del restaurante.`;
}

function buildHeuristicPairings(
  wines: SommelierCatalogItem[],
  dishes: SommelierCatalogItem[],
): { pairings: SommelierPairing[]; wineProfiles: Record<string, SommelierWineProfile> } {
  const pairings: SommelierPairing[] = [];
  for (const dish of dishes) {
    const ranked = wines
      .map((wine) => ({ wine, score: heuristicScore(wine, dish) }))
      .sort((a, b) => b.score - a.score || a.wine.name.localeCompare(b.wine.name, "es"))
      .slice(0, PAIRINGS_PER_DISH);
    for (const { wine, score } of ranked) {
      pairings.push({
        id: `${wine.id}__${dish.id}`,
        wineProductId: wine.id,
        wineName: wine.name,
        dishProductId: dish.id,
        dishName: dish.name,
        score,
        reason: heuristicReason(wine, dish),
        tags: [wineStyle(wine), dish.categoryName].filter(Boolean).slice(0, 4),
        source: "heuristic",
      });
      if (pairings.length >= MAX_PAIRINGS) break;
    }
    if (pairings.length >= MAX_PAIRINGS) break;
  }
  const wineProfiles = Object.fromEntries(wines.map((wine) => [wine.id, fallbackWineProfile(wine)]));
  return { pairings, wineProfiles };
}

type AiPairingJson = {
  pairings?: Array<{
    wineProductId?: unknown;
    dishProductId?: unknown;
    score?: unknown;
    reason?: unknown;
    tags?: unknown;
  }>;
  wineProfiles?: Array<{
    wineProductId?: unknown;
    style?: unknown;
    body?: unknown;
    sweetness?: unknown;
    grapes?: unknown;
    notes?: unknown;
    confidence?: unknown;
  }>;
};

function extractJson(text: string): AiPairingJson | null {
  const trimmed = text.trim();
  const candidate = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" ? (parsed as AiPairingJson) : null;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as AiPairingJson;
    } catch {
      return null;
    }
  }
}

function safeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function validateAiOutput(
  raw: AiPairingJson,
  wines: SommelierCatalogItem[],
  dishes: SommelierCatalogItem[],
): { pairings: SommelierPairing[]; wineProfiles: Record<string, SommelierWineProfile> } {
  const wineMap = new Map(wines.map((item) => [item.id, item]));
  const dishMap = new Map(dishes.map((item) => [item.id, item]));
  const pairings: SommelierPairing[] = [];
  const seen = new Set<string>();
  for (const candidate of raw.pairings ?? []) {
    const wineId = typeof candidate.wineProductId === "string" ? candidate.wineProductId : "";
    const dishId = typeof candidate.dishProductId === "string" ? candidate.dishProductId : "";
    const wine = wineMap.get(wineId);
    const dish = dishMap.get(dishId);
    if (!wine || !dish) continue;
    const id = `${wineId}__${dishId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const numericScore = Number(candidate.score);
    const score = Number.isFinite(numericScore) ? Math.max(1, Math.min(100, Math.round(numericScore))) : 70;
    const reason = cleanText(candidate.reason, 360);
    if (!reason) continue;
    const tags = Array.isArray(candidate.tags)
      ? candidate.tags.map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 5)
      : [];
    pairings.push({
      id,
      wineProductId: wine.id,
      wineName: wine.name,
      dishProductId: dish.id,
      dishName: dish.name,
      score,
      reason,
      tags,
      source: "ai",
    });
    if (pairings.length >= MAX_PAIRINGS) break;
  }

  const wineProfiles: Record<string, SommelierWineProfile> = Object.fromEntries(
    wines.map((wine) => [wine.id, fallbackWineProfile(wine)]),
  );
  for (const profile of raw.wineProfiles ?? []) {
    const wineId = typeof profile.wineProductId === "string" ? profile.wineProductId : "";
    if (!wineMap.has(wineId)) continue;
    const confidenceRaw = Number(profile.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.5;
    wineProfiles[wineId] = {
      style: safeEnum(profile.style, ["red", "white", "rose", "sparkling", "sweet", "fortified", "unknown"] as const, "unknown"),
      body: safeEnum(profile.body, ["light", "medium", "full", "unknown"] as const, "unknown"),
      sweetness: safeEnum(profile.sweetness, ["dry", "off_dry", "sweet", "unknown"] as const, "unknown"),
      grapes: Array.isArray(profile.grapes)
        ? profile.grapes.map((grape) => cleanText(grape, 60)).filter(Boolean).slice(0, 6)
        : [],
      notes: Array.isArray(profile.notes)
        ? profile.notes.map((note) => cleanText(note, 80)).filter(Boolean).slice(0, 6)
        : [],
      confidence,
    };
  }
  return { pairings, wineProfiles };
}

function buildPrompt(wines: SommelierCatalogItem[], dishes: SommelierCatalogItem[]): string {
  return [
    "You are Hostly Sommelier, a conservative restaurant pairing assistant.",
    "Use ONLY the exact wineProductId and dishProductId values provided below.",
    "Never invent products, vintages, grapes, appellations or ingredients. If a grape/style is not reasonably inferable, use unknown/empty arrays.",
    "Recommend up to 3 wines per dish, prioritizing culinary compatibility and useful variety. Reasons must be concise and practical for a waiter speaking to a guest.",
    "Return JSON only, with this shape:",
    '{"pairings":[{"wineProductId":"...","dishProductId":"...","score":0,"reason":"...","tags":["..."]}],"wineProfiles":[{"wineProductId":"...","style":"red|white|rose|sparkling|sweet|fortified|unknown","body":"light|medium|full|unknown","sweetness":"dry|off_dry|sweet|unknown","grapes":[],"notes":[],"confidence":0.0}]}',
    "Wines:",
    JSON.stringify(wines.map(({ id, name, categoryName, familyName, price, description }) => ({ id, name, categoryName, familyName, price, description }))),
    "Dishes:",
    JSON.stringify(dishes.map(({ id, name, categoryName, familyName, price, description }) => ({ id, name, categoryName, familyName, price, description }))),
  ].join("\n");
}

async function generateAiPairings(params: {
  restaurantId: string;
  userId: string;
  wines: SommelierCatalogItem[];
  dishes: SommelierCatalogItem[];
}): Promise<{
  pairings: SommelierPairing[];
  wineProfiles: Record<string, SommelierWineProfile>;
  model: string;
} | null> {
  if (params.wines.length === 0 || params.dishes.length === 0) return null;
  const model = process.env.HOSTLY_AI_SOMMELIER_MODEL?.trim() || DEFAULT_MODEL;
  try {
    const result = await generateText({
      model,
      prompt: buildPrompt(params.wines, params.dishes),
      maxRetries: 1,
      providerOptions: {
        gateway: {
          user: `restaurant:${params.restaurantId}:user:${params.userId}`,
          tags: ["hostly", "sommelier", params.restaurantId],
          disallowPromptTraining: true,
        },
      },
    });
    const parsed = extractJson(result.text);
    if (!parsed) return null;
    const validated = validateAiOutput(parsed, params.wines, params.dishes);
    if (validated.pairings.length === 0) return null;
    return { ...validated, model };
  } catch (error) {
    console.error("[sommelier] ai_generation_failed", {
      restaurantId: params.restaurantId,
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return null;
  }
}

function pairingDoc(pairing: SommelierPairing, params: {
  catalogHash: string;
  generatedAtMs: number;
  generatedBy: string;
  source: SommelierPairingSource;
  model: string | null;
}) {
  return {
    type: "pairing",
    ...pairing,
    catalogHash: params.catalogHash,
    generatedAtMs: params.generatedAtMs,
    generatedBy: params.generatedBy,
    source: params.source,
    model: params.model,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function generateAndPersistSommelierSnapshot(params: {
  db: Firestore;
  restaurantId: string;
  userId: string;
}): Promise<SommelierSnapshot> {
  const catalog = await loadSommelierCatalog(params);
  const generatedAtMs = Date.now();
  const ai = await generateAiPairings({
    restaurantId: params.restaurantId,
    userId: params.userId,
    wines: catalog.wines,
    dishes: catalog.dishes,
  });
  const fallback = ai ?? buildHeuristicPairings(catalog.wines, catalog.dishes);
  const source: SommelierPairingSource = ai ? "ai" : "heuristic";
  const model = ai?.model ?? null;
  const collection = params.db
    .collection("restaurants")
    .doc(params.restaurantId)
    .collection(COLLECTION);

  const existing = await collection.get();
  let batch = params.db.batch();
  let ops = 0;
  for (const doc of existing.docs) {
    batch.delete(doc.ref);
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = params.db.batch();
      ops = 0;
    }
  }
  for (const pairing of fallback.pairings) {
    batch.set(collection.doc(pairing.id), pairingDoc(pairing, {
      catalogHash: catalog.catalogHash,
      generatedAtMs,
      generatedBy: params.userId,
      source,
      model,
    }));
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = params.db.batch();
      ops = 0;
    }
  }
  batch.set(collection.doc(META_DOC), {
    type: "meta",
    catalogHash: catalog.catalogHash,
    generatedAtMs,
    generatedBy: params.userId,
    source,
    model,
    wineProfiles: fallback.wineProfiles,
    wineCount: catalog.wines.length,
    dishCount: catalog.dishes.length,
    pairingCount: fallback.pairings.length,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return {
    catalogHash: catalog.catalogHash,
    generatedAtMs,
    generatedBy: params.userId,
    model,
    source,
    wines: catalog.wines,
    dishes: catalog.dishes,
    pairings: fallback.pairings,
    wineProfiles: fallback.wineProfiles,
  };
}

function readPairingDoc(id: string, data: Record<string, unknown>): SommelierPairing | null {
  if (data.type !== "pairing") return null;
  const wineProductId = cleanText(data.wineProductId, 160);
  const dishProductId = cleanText(data.dishProductId, 160);
  const wineName = cleanText(data.wineName, 180);
  const dishName = cleanText(data.dishName, 180);
  const reason = cleanText(data.reason, 360);
  if (!wineProductId || !dishProductId || !wineName || !dishName || !reason) return null;
  const scoreRaw = Number(data.score);
  const score = Number.isFinite(scoreRaw) ? Math.max(1, Math.min(100, Math.round(scoreRaw))) : 70;
  return {
    id,
    wineProductId,
    wineName,
    dishProductId,
    dishName,
    score,
    reason,
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 5) : [],
    source: data.source === "ai" ? "ai" : "heuristic",
  };
}

function readWineProfile(value: unknown): SommelierWineProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    style: safeEnum(raw.style, ["red", "white", "rose", "sparkling", "sweet", "fortified", "unknown"] as const, "unknown"),
    body: safeEnum(raw.body, ["light", "medium", "full", "unknown"] as const, "unknown"),
    sweetness: safeEnum(raw.sweetness, ["dry", "off_dry", "sweet", "unknown"] as const, "unknown"),
    grapes: Array.isArray(raw.grapes) ? raw.grapes.map((item) => cleanText(item, 60)).filter(Boolean).slice(0, 6) : [],
    notes: Array.isArray(raw.notes) ? raw.notes.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 6) : [],
    confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
  };
}

export async function loadPersistedSommelierSnapshot(params: {
  db: Firestore;
  restaurantId: string;
}): Promise<SommelierSnapshot> {
  const catalog = await loadSommelierCatalog(params);
  const collection = params.db
    .collection("restaurants")
    .doc(params.restaurantId)
    .collection(COLLECTION);
  const snap = await collection.get();
  const pairings: SommelierPairing[] = [];
  let generatedAtMs: number | null = null;
  let generatedBy: string | null = null;
  let model: string | null = null;
  let source: SommelierPairingSource | null = null;
  let persistedHash = "";
  let wineProfiles: Record<string, SommelierWineProfile> = {};

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (doc.id === META_DOC || data.type === "meta") {
      persistedHash = cleanText(data.catalogHash, 80);
      generatedAtMs = typeof data.generatedAtMs === "number" && Number.isFinite(data.generatedAtMs) ? data.generatedAtMs : null;
      generatedBy = cleanText(data.generatedBy, 160) || null;
      model = cleanText(data.model, 160) || null;
      source = data.source === "ai" ? "ai" : data.source === "heuristic" ? "heuristic" : null;
      if (data.wineProfiles && typeof data.wineProfiles === "object" && !Array.isArray(data.wineProfiles)) {
        for (const [wineId, value] of Object.entries(data.wineProfiles as Record<string, unknown>)) {
          const profile = readWineProfile(value);
          if (profile) wineProfiles[wineId] = profile;
        }
      }
      continue;
    }
    const pairing = readPairingDoc(doc.id, data);
    if (pairing) pairings.push(pairing);
  }

  const stale = Boolean(persistedHash && persistedHash !== catalog.catalogHash);
  if (stale) {
    return {
      catalogHash: catalog.catalogHash,
      generatedAtMs,
      generatedBy,
      model,
      source,
      wines: catalog.wines,
      dishes: catalog.dishes,
      pairings: [],
      wineProfiles: {},
    };
  }

  pairings.sort((a, b) => b.score - a.score || a.dishName.localeCompare(b.dishName, "es"));
  return {
    catalogHash: catalog.catalogHash,
    generatedAtMs,
    generatedBy,
    model,
    source,
    wines: catalog.wines,
    dishes: catalog.dishes,
    pairings,
    wineProfiles,
  };
}
