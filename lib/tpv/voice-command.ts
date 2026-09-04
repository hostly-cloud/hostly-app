export const TPV_VOICE_COMMAND_EVENT = "hostly:tpv-voice-command";
export const TPV_VOICE_FEEDBACK_EVENT = "hostly:tpv-voice-feedback";

export type TpvVoiceCommandDetail = {
  transcript: string;
  source: "tpv";
};

export type TpvVoiceFeedbackTone = "info" | "success" | "error";

export type TpvVoiceFeedbackDetail = {
  message: string;
  tone?: TpvVoiceFeedbackTone;
};

export type TpvVoiceOrderItem = {
  productQuery: string;
  quantity: number;
};

export type TpvVoiceCommand =
  | { type: "open_table"; tableQuery: string }
  | { type: "back_to_map" }
  | { type: "add_product"; productQuery: string; quantity: number }
  | {
      type: "add_products_to_table";
      tableQuery: string;
      items: TpvVoiceOrderItem[];
      sendOrder: true;
    }
  | { type: "send_order" }
  | { type: "march_course"; course: "primeros" | "segundos" | "postres" }
  | { type: "confirm_march" }
  | { type: "preticket" }
  | { type: "charge" }
  | { type: "unknown"; transcript: string };

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  unha: 1,
  dos: 2,
  dous: 2,
  duas: 2,
  tres: 3,
  cuatro: 4,
  catro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  sete: 7,
  ocho: 8,
  oito: 8,
  nueve: 9,
  nove: 9,
  diez: 10,
  dez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
};

const COMPOUND_TENS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
};

const ORDER_REQUEST_PREFIXES = [
  "me puedes poner",
  "puedes ponerme",
  "puedes poner",
  "me pones",
  "ponme",
  "pon",
  "me puedes traer",
  "puedes traerme",
  "puedes traer",
  "me traes",
  "traeme",
  "trae",
  "me puedes sacar",
  "puedes sacarme",
  "puedes sacar",
  "me sacas",
  "sacame",
  "saca",
  "me puedes meter",
  "puedes meterme",
  "puedes meter",
  "me metes",
  "meteme",
  "mete",
  "toma nota de",
  "toma nota",
  "apuntame",
  "apunta",
  "anotame",
  "anota",
  "echame",
  "echa",
  "sirveme",
  "sirve",
  "llevame",
  "lleva",
  "anademe",
  "anade",
  "anadir",
  "agregame",
  "agrega",
  "agregar",
  "sumame",
  "suma",
  "sumar",
  "dame",
  "necesito",
  "quiero",
  "engademe",
  "engade",
  "engadir",
] as const;

const INLINE_SPEECH_FILLERS = new Set(["eh", "ehm", "em", "mmm", "mm"]);
const LEADING_SPEECH_FILLERS = new Set([
  "bueno",
  "vale",
  "pues",
  "oye",
  "mira",
  "perdon",
  "perdona",
]);
const CORRECTION_PREFIXES = [
  "quiero decir",
  "queria decir",
  "mejor dicho",
] as const;
const EXPLICIT_INLINE_CORRECTIONS = [
  " no mejor ",
  " perdon mejor ",
  " perdona mejor ",
  " no queria decir ",
  " no quiero decir ",
] as const;
const PACKAGING_WORDS = new Set([
  "botella",
  "botellas",
  "copa",
  "copas",
  "vaso",
  "vasos",
  "cana",
  "canas",
  "jarra",
  "jarras",
  "unidad",
  "unidades",
  "racion",
  "raciones",
]);
const ITEM_SEPARATORS = new Set(["y", "e", "mas", "ademas", "tambien", "luego"]);

export function normalizeTpvVoiceText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQuantityToken(token: string | undefined): number | null {
  const normalized = normalizeTpvVoiceText(token ?? "");
  if (!normalized) return null;
  if (/^\d{1,2}$/.test(normalized)) {
    const value = Number(normalized);
    return value >= 1 && value <= 50 ? value : null;
  }
  return NUMBER_WORDS[normalized] ?? null;
}

function parseSpokenNumberPhrase(value: string): number | null {
  const normalized = normalizeTpvVoiceText(value);
  if (!normalized) return null;

  const direct = parseQuantityToken(normalized);
  if (direct != null) return direct;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 3 && tokens[1] === "y") {
    const tens = COMPOUND_TENS[tokens[0]!];
    const unit = parseQuantityToken(tokens[2]);
    if (tens != null && unit != null && unit >= 1 && unit <= 9) {
      const result = tens + unit;
      return result <= 50 ? result : null;
    }
  }

  return null;
}

function stripLeadingFillers(value: string): string {
  return value
    .replace(/^(?:por favor\s+)+/, "")
    .replace(/^(?:de|del|de la|de los|de las)\s+/, "")
    .replace(/\s+(?:por favor)$/, "")
    .trim();
}

function stripLeadingOrderRequest(value: string): string {
  const normalized = value.trim();
  const prefix = ORDER_REQUEST_PREFIXES.find(
    (candidate) => normalized === candidate || normalized.startsWith(`${candidate} `),
  );
  return prefix ? normalized.slice(prefix.length).trim() : normalized;
}

function hasLeadingOrderRequest(value: string): boolean {
  const normalized = value.trim();
  return ORDER_REQUEST_PREFIXES.some(
    (candidate) => normalized === candidate || normalized.startsWith(`${candidate} `),
  );
}

function applyExplicitInlineCorrection(value: string): string {
  let latestIndex = -1;
  let latestMarker = "";
  for (const marker of EXPLICIT_INLINE_CORRECTIONS) {
    const index = value.lastIndexOf(marker);
    if (index > latestIndex) {
      latestIndex = index;
      latestMarker = marker;
    }
  }
  if (latestIndex < 0) return value.trim();
  const corrected = value.slice(latestIndex + latestMarker.length).trim();
  return corrected || value.trim();
}

function stripSpeechDisfluencies(value: string): string {
  let tokens = value
    .split(" ")
    .filter(Boolean)
    .filter((token) => !INLINE_SPEECH_FILLERS.has(token));

  while (tokens.length > 1 && LEADING_SPEECH_FILLERS.has(tokens[0]!)) {
    tokens = tokens.slice(1);
  }

  let cleaned = tokens.join(" ").trim();
  cleaned = applyExplicitInlineCorrection(cleaned);

  let changed = true;
  while (changed && cleaned) {
    changed = false;
    for (const prefix of CORRECTION_PREFIXES) {
      if (cleaned.startsWith(`${prefix} `)) {
        cleaned = cleaned.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }

  const correctionTokens = cleaned.split(" ").filter(Boolean);
  if (
    correctionTokens[0] === "era" &&
    correctionTokens.length > 1 &&
    (parseQuantityToken(correctionTokens[1]) != null ||
      ["el", "la", "los", "las"].includes(correctionTokens[1]!))
  ) {
    cleaned = correctionTokens.slice(1).join(" ");
  }

  return stripLeadingFillers(cleaned);
}

function stripRedundantTrailingPackagingPhrase(value: string): string {
  const match = value.match(/\s+(?:a\s+(?:la|el)\s+|al\s+)([a-z0-9]+)$/);
  const packagingToken = match?.[1] ?? "";
  if (!match || !PACKAGING_WORDS.has(packagingToken)) return value.trim();

  const preceding = value.slice(0, match.index).trim();
  const precedingTokens = new Set(preceding.split(" ").filter(Boolean));
  const singularPackaging = packagingToken.endsWith("s")
    ? packagingToken.slice(0, -1)
    : packagingToken;
  const alreadyMentioned =
    precedingTokens.has(packagingToken) || precedingTokens.has(singularPackaging);

  return alreadyMentioned ? preceding : value.trim();
}

function normalizeTableQuery(value: string): string {
  const cleaned = stripLeadingFillers(stripSpeechDisfluencies(value))
    .replace(/^(?:la|el)\s+/, "")
    .replace(/^(?:mesa\s+)+/, "")
    .replace(/^(?:numero|num|nro)\s+/, "")
    .trim();
  const spokenNumber = parseSpokenNumberPhrase(cleaned);
  return spokenNumber != null ? String(spokenNumber) : cleaned;
}

type QuantityPrefix = {
  quantity: number;
  productQuery: string;
};

function parseQuantityPrefix(value: string): QuantityPrefix | null {
  const cleaned = stripLeadingFillers(value);
  if (!cleaned) return null;

  const pair = cleaned.match(/^(?:un|una)?\s*par\s+de\s+(.+)$/);
  if (pair?.[1]) return { quantity: 2, productQuery: pair[1].trim() };

  const halfDozen = cleaned.match(/^(?:una\s+)?media\s+docena\s+de\s+(.+)$/);
  if (halfDozen?.[1]) return { quantity: 6, productQuery: halfDozen[1].trim() };

  const dozen = cleaned.match(/^(?:una\s+)?docena\s+de\s+(.+)$/);
  if (dozen?.[1]) return { quantity: 12, productQuery: dozen[1].trim() };

  const another = cleaned.match(/^(?:otro|otra)\s+(.+)$/);
  if (another?.[1]) return { quantity: 1, productQuery: another[1].trim() };

  const more = cleaned.match(/^(?:otros|otras)\s+(.+)$/);
  if (more?.[1]) {
    const nested = parseQuantityPrefix(more[1]);
    if (nested) return nested;
  }

  const xPrefix = cleaned.match(/^x\s*(\d{1,2})\s+(.+)$/);
  if (xPrefix?.[1] && xPrefix[2]) {
    const quantity = parseQuantityToken(xPrefix[1]);
    if (quantity != null) return { quantity, productQuery: xPrefix[2].trim() };
  }

  const numericXPrefix = cleaned.match(/^(\d{1,2})\s*x\s+(.+)$/);
  if (numericXPrefix?.[1] && numericXPrefix[2]) {
    const quantity = parseQuantityToken(numericXPrefix[1]);
    if (quantity != null) return { quantity, productQuery: numericXPrefix[2].trim() };
  }

  const tokens = cleaned.split(" ").filter(Boolean);
  for (const consumed of [3, 1]) {
    if (tokens.length <= consumed) continue;
    const quantityText = tokens.slice(0, consumed).join(" ");
    const quantity = parseSpokenNumberPhrase(quantityText);
    if (quantity == null) continue;
    const productQuery = stripLeadingFillers(tokens.slice(consumed).join(" "));
    if (productQuery) return { quantity, productQuery };
  }

  return null;
}

function parseAddProduct(normalized: string): TpvVoiceCommand | null {
  const cleaned = stripSpeechDisfluencies(normalized);
  const hadRequest = hasLeadingOrderRequest(cleaned);
  const value = stripLeadingOrderRequest(cleaned);

  const xSuffix = value.match(/^(.+?)\s+x\s*(\d{1,2})$/);
  if (xSuffix?.[1] && xSuffix[2]) {
    const quantity = parseQuantityToken(xSuffix[2]);
    const productQuery = stripLeadingFillers(xSuffix[1]);
    if (quantity && productQuery) {
      return { type: "add_product", productQuery, quantity };
    }
  }

  const quantityPrefix = parseQuantityPrefix(value);
  if (quantityPrefix) {
    return {
      type: "add_product",
      productQuery: quantityPrefix.productQuery,
      quantity: quantityPrefix.quantity,
    };
  }

  if (hadRequest) {
    const productQuery = stripLeadingFillers(value);
    if (productQuery) return { type: "add_product", productQuery, quantity: 1 };
  }

  return null;
}

function quantityStartsAt(tokens: string[], index: number): boolean {
  if (index < 0 || index >= tokens.length) return false;
  if (parseQuantityToken(tokens[index]) != null) return true;
  if (["otro", "otra", "otros", "otras"].includes(tokens[index]!)) return true;
  if (tokens[index] === "media" && tokens[index + 1] === "docena") return true;
  if (tokens[index] === "docena" || tokens[index] === "par") return true;
  if (
    index + 2 < tokens.length &&
    parseSpokenNumberPhrase(tokens.slice(index, index + 3).join(" ")) != null
  ) {
    return true;
  }
  return false;
}

function splitCompositeOrderItems(value: string): string[] {
  const tokens = value.split(" ").filter(Boolean);
  const parts: string[] = [];
  let current: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const nextIndex = index + 1;
    const isSeparator = ITEM_SEPARATORS.has(token);

    if (isSeparator && current.length > 0 && quantityStartsAt(tokens, nextIndex)) {
      parts.push(current.join(" "));
      current = [];
      continue;
    }

    const startsAnotherQuantifiedItem =
      current.length >= 2 &&
      parseQuantityPrefix(current.join(" ")) != null &&
      quantityStartsAt(tokens, index);
    if (startsAnotherQuantifiedItem) {
      parts.push(current.join(" "));
      current = [token];
      continue;
    }

    if (isSeparator && current.length === 0) continue;
    current.push(token);
  }

  if (current.length > 0) parts.push(current.join(" "));
  return parts;
}

function recoverNoisyLeadingQuantity(value: string): TpvVoiceOrderItem | null {
  const tokens = value.split(" ").filter(Boolean);
  const maxQuantityIndex = Math.min(3, tokens.length - 2);

  for (let index = 1; index <= maxQuantityIndex; index += 1) {
    const candidate = tokens.slice(index).join(" ");
    const parsed = parseQuantityPrefix(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function parseCompositeOrderItem(value: string): TpvVoiceOrderItem | null {
  const cleaned = stripLeadingOrderRequest(stripSpeechDisfluencies(value));
  const quantityPrefix = parseQuantityPrefix(cleaned);
  if (quantityPrefix) return quantityPrefix;

  const xSuffix = cleaned.match(/^(.+?)\s+x\s*(\d{1,2})$/);
  if (xSuffix?.[1] && xSuffix[2]) {
    const quantity = parseQuantityToken(xSuffix[2]);
    if (quantity != null) {
      return { productQuery: stripLeadingFillers(xSuffix[1]), quantity };
    }
  }

  const noisyRecovery = recoverNoisyLeadingQuantity(cleaned);
  if (noisyRecovery) return noisyRecovery;

  const productQuery = stripLeadingFillers(cleaned);
  if (!productQuery) return null;
  return { productQuery, quantity: 1 };
}

type OrderTableParts = {
  orderText: string;
  tableQuery: string;
};

function splitNumberPrefix(value: string): { tableQuery: string; rest: string } | null {
  const tokens = value.split(" ").filter(Boolean);
  if (tokens[0] === "numero") tokens.shift();

  for (const consumed of [3, 1]) {
    if (tokens.length <= consumed) continue;
    const numberText = tokens.slice(0, consumed).join(" ");
    const number = parseSpokenNumberPhrase(numberText);
    if (number == null) continue;
    const rest = tokens.slice(consumed).join(" ").trim();
    if (rest) return { tableQuery: String(number), rest };
  }
  return null;
}

function extractTrailingTableTarget(cleaned: string): OrderTableParts | null {
  const explicit = cleaned.match(
    /^(.+?)\s+(?:a|en|para|pa)\s+(?:la\s+|el\s+)?mesa\s+(.+)$/,
  );
  if (explicit?.[1] && explicit[2]) {
    return {
      orderText: explicit[1].trim(),
      tableQuery: normalizeTableQuery(explicit[2]),
    };
  }

  const bareTargetPatterns = [
    /^(.*?)\s+a\s+la\s+(.+)$/,
    /^(.*?)\s+al\s+(.+)$/,
    /^(.*?)\s+para\s+la\s+(.+)$/,
    /^(.*?)\s+para\s+el\s+(.+)$/,
    /^(.*?)\s+para\s+(.+)$/,
    /^(.*?)\s+pa\s+la\s+(.+)$/,
    /^(.*?)\s+pal\s+(.+)$/,
    /^(.*?)\s+pa\s+(.+)$/,
    /^(.*?)\s+en\s+la\s+(.+)$/,
    /^(.*?)\s+en\s+el\s+(.+)$/,
  ];

  for (const pattern of bareTargetPatterns) {
    const match = cleaned.match(pattern);
    const orderText = match?.[1]?.trim() ?? "";
    const rawTable = match?.[2]?.trim() ?? "";
    if (!orderText || !rawTable) continue;
    const tableNumber = parseSpokenNumberPhrase(rawTable.replace(/^(?:numero)\s+/, ""));
    if (tableNumber == null) continue;
    return { orderText, tableQuery: String(tableNumber) };
  }

  return null;
}

function extractLeadingTableTarget(cleaned: string): OrderTableParts | null {
  const explicitMesa = cleaned.match(
    /^(?:(?:para|pa|a|en)\s+)?(?:la\s+|el\s+)?mesa\s+(.+)$/,
  );
  if (explicitMesa?.[1]) {
    const rest = explicitMesa[1].trim();
    const numeric = splitNumberPrefix(rest);
    if (numeric) return { orderText: numeric.rest, tableQuery: numeric.tableQuery };

    const requestPositions = ORDER_REQUEST_PREFIXES
      .map((prefix) => ({ prefix, index: rest.indexOf(` ${prefix} `) }))
      .filter(({ index }) => index > 0)
      .sort((a, b) => a.index - b.index);
    const firstRequest = requestPositions[0];
    if (firstRequest) {
      const tableQuery = normalizeTableQuery(rest.slice(0, firstRequest.index));
      const orderText = rest.slice(firstRequest.index + 1).trim();
      if (tableQuery && orderText) return { tableQuery, orderText };
    }
  }

  const bare = cleaned.match(/^(?:para|pa|a|en)\s+(?:la\s+|el\s+)?(.+)$/);
  if (bare?.[1]) {
    const numeric = splitNumberPrefix(bare[1].trim());
    if (numeric) return { orderText: numeric.rest, tableQuery: numeric.tableQuery };
  }

  return null;
}

function parseOrderForTable(normalized: string): TpvVoiceCommand | null {
  const cleaned = stripSpeechDisfluencies(normalized);
  const parts = extractTrailingTableTarget(cleaned) ?? extractLeadingTableTarget(cleaned);
  if (!parts) return null;

  const orderText = stripLeadingOrderRequest(
    stripRedundantTrailingPackagingPhrase(stripSpeechDisfluencies(parts.orderText)),
  );
  const tableQuery = normalizeTableQuery(parts.tableQuery);
  if (!orderText || !tableQuery) return null;

  const items = splitCompositeOrderItems(orderText)
    .map(parseCompositeOrderItem)
    .filter((item): item is TpvVoiceOrderItem => item != null);

  if (items.length === 0) return null;
  return {
    type: "add_products_to_table",
    tableQuery,
    items,
    sendOrder: true,
  };
}

export function parseTpvVoiceCommand(transcript: string): TpvVoiceCommand {
  const normalized = stripSpeechDisfluencies(normalizeTpvVoiceText(transcript));
  if (!normalized) return { type: "unknown", transcript };

  if (
    /^(?:volver|vuelve|volve|ir|ve)\s+(?:al|ao)\s+mapa$/.test(normalized) ||
    normalized === "mapa"
  ) {
    return { type: "back_to_map" };
  }

  if (
    /^(?:enviar|envia|mandar|manda)\s+(?:la\s+)?comanda$/.test(normalized) ||
    /^(?:enviar|envia|mandar|manda)\s+(?:el\s+)?pedido$/.test(normalized) ||
    /^(?:enviar|envia|mandar|manda)\s+(?:a\s+)?(?:cocina|barra)$/.test(normalized)
  ) {
    return { type: "send_order" };
  }

  const marchMatch = normalized.match(
    /^(?:marchar|marcha)\s+(primeros?|segundos?|postres?)$/,
  );
  if (marchMatch) {
    const raw = marchMatch[1] ?? "";
    const course = raw.startsWith("primer")
      ? "primeros"
      : raw.startsWith("segund")
        ? "segundos"
        : "postres";
    return { type: "march_course", course };
  }

  if (/^(?:confirmar|confirma)(?:\s+marcha)?$/.test(normalized)) {
    return { type: "confirm_march" };
  }

  if (
    /^(?:imprimir\s+)?pre\s*ticket$/.test(normalized) ||
    normalized === "preticket"
  ) {
    return { type: "preticket" };
  }

  if (
    /^(?:abrir\s+)?cobro$/.test(normalized) ||
    /^(?:cobrar|cobra)(?:\s+(?:la\s+)?mesa)?$/.test(normalized)
  ) {
    return { type: "charge" };
  }

  const tableOrder = parseOrderForTable(normalized);
  if (tableOrder) return tableOrder;

  const tableMatch = normalized.match(
    /^(?:(?:abre|abrir|entra|entrar|ve|vete|ir)\s+(?:a|en)?\s*(?:la\s+)?mesa|mesa)\s+(.+)$/,
  );
  if (tableMatch) {
    const tableQuery = normalizeTableQuery(tableMatch[1] ?? "");
    if (tableQuery) return { type: "open_table", tableQuery };
  }

  const addProduct = parseAddProduct(normalized);
  if (addProduct) return addProduct;

  return { type: "unknown", transcript };
}

function canonicalToken(token: string): string {
  if (/^\d+$/.test(token)) return token;
  const number = NUMBER_WORDS[token];
  if (number != null) return String(number);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function canonicalTpvVoiceSearchText(value: string): string {
  return normalizeTpvVoiceText(value)
    .split(" ")
    .filter(Boolean)
    .map(canonicalToken)
    .join(" ");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]!;
  }

  return previous[b.length]!;
}

export function scoreTpvVoiceCandidate(query: string, candidate: string): number {
  const q = canonicalTpvVoiceSearchText(query);
  const c = canonicalTpvVoiceSearchText(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;

  if (c.includes(q) || q.includes(c)) {
    const ratio = Math.min(q.length, c.length) / Math.max(q.length, c.length);
    return 0.84 + ratio * 0.12;
  }

  const queryTokens = new Set(q.split(" ").filter(Boolean));
  const candidateTokens = new Set(c.split(" ").filter(Boolean));
  let intersection = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) intersection += 1;
  }
  const union = new Set([...queryTokens, ...candidateTokens]).size;
  const tokenScore = union > 0 ? intersection / union : 0;

  const maxLength = Math.max(q.length, c.length);
  const editScore =
    maxLength > 0 ? 1 - levenshteinDistance(q, c) / maxLength : 0;

  return Math.max(tokenScore * 0.9, editScore * 0.88);
}
