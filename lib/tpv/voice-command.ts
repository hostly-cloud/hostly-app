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
};

const ADD_VERBS = [
  "anade",
  "anadir",
  "agrega",
  "agregar",
  "pon",
  "ponme",
  "mete",
  "meter",
  "suma",
  "sumar",
  "sirve",
  "servir",
  "dame",
  "quiero",
  "engade",
  "engadir",
] as const;

const INLINE_SPEECH_FILLERS = new Set(["eh", "ehm", "em", "mmm", "mm"]);
const LEADING_SPEECH_FILLERS = new Set([
  "bueno",
  "vale",
  "pues",
  "perdon",
  "perdona",
]);
const CORRECTION_PREFIXES = ["quiero decir", "mejor dicho"] as const;
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

function stripLeadingFillers(value: string): string {
  return value
    .replace(/^(?:de|del|de la|de los|de las)\s+/, "")
    .replace(/\s+(?:por favor)$/, "")
    .trim();
}

function stripLeadingAddVerb(value: string): string {
  const verb = ADD_VERBS.find(
    (candidate) => value === candidate || value.startsWith(`${candidate} `),
  );
  return verb ? value.slice(verb.length).trim() : value.trim();
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

  return cleaned.trim();
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
  return stripLeadingFillers(stripSpeechDisfluencies(value))
    .replace(/^(?:numero|num|nro)\s+/, "")
    .trim();
}

function parseAddProduct(normalized: string): TpvVoiceCommand | null {
  const cleaned = stripSpeechDisfluencies(normalized);
  const hasAddVerb = ADD_VERBS.some(
    (verb) => cleaned === verb || cleaned.startsWith(`${verb} `),
  );

  let value = cleaned;
  if (hasAddVerb) value = stripLeadingAddVerb(value);

  const xSuffix = value.match(/^(.+?)\s+x\s*(\d{1,2})$/);
  if (xSuffix) {
    const quantity = parseQuantityToken(xSuffix[2]);
    const productQuery = stripLeadingFillers(xSuffix[1] ?? "");
    if (quantity && productQuery) {
      return { type: "add_product", productQuery, quantity };
    }
  }

  const firstSpace = value.indexOf(" ");
  const firstToken = firstSpace === -1 ? value : value.slice(0, firstSpace);
  const quantity = parseQuantityToken(firstToken);
  if (quantity != null) {
    const productQuery = stripLeadingFillers(
      firstSpace === -1 ? "" : value.slice(firstSpace + 1),
    );
    if (productQuery) return { type: "add_product", productQuery, quantity };
  }

  if (hasAddVerb) {
    const productQuery = stripLeadingFillers(value);
    if (productQuery) return { type: "add_product", productQuery, quantity: 1 };
  }

  return null;
}

function splitCompositeOrderItems(value: string): string[] {
  const tokens = value.split(" ").filter(Boolean);
  const parts: string[] = [];
  let current: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const next = tokens[index + 1];
    const isSeparator = token === "y" || token === "e" || token === "mas";

    if (isSeparator && current.length > 0 && parseQuantityToken(next) != null) {
      parts.push(current.join(" "));
      current = [];
      continue;
    }

    const startsAnotherQuantifiedItem =
      current.length >= 2 &&
      parseQuantityToken(current[0]) != null &&
      parseQuantityToken(token) != null;
    if (startsAnotherQuantifiedItem) {
      parts.push(current.join(" "));
      current = [token];
      continue;
    }

    current.push(token);
  }

  if (current.length > 0) parts.push(current.join(" "));
  return parts;
}

function recoverNoisyLeadingQuantity(value: string): TpvVoiceOrderItem | null {
  const tokens = value.split(" ").filter(Boolean);
  const maxQuantityIndex = Math.min(2, tokens.length - 2);

  for (let index = 1; index <= maxQuantityIndex; index += 1) {
    const quantity = parseQuantityToken(tokens[index]);
    if (quantity == null) continue;

    const productQuery = stripLeadingFillers(tokens.slice(index + 1).join(" "));
    if (!productQuery) continue;

    return { productQuery, quantity };
  }

  return null;
}

function parseCompositeOrderItem(value: string): TpvVoiceOrderItem | null {
  const parsed = parseAddProduct(value);
  if (parsed?.type === "add_product") {
    return {
      productQuery: parsed.productQuery,
      quantity: parsed.quantity,
    };
  }

  const noisyRecovery = recoverNoisyLeadingQuantity(value);
  if (noisyRecovery) return noisyRecovery;

  const productQuery = stripLeadingFillers(stripLeadingAddVerb(value));
  if (!productQuery) return null;
  return { productQuery, quantity: 1 };
}

function parseOrderForTable(normalized: string): TpvVoiceCommand | null {
  const cleaned = stripSpeechDisfluencies(normalized);
  const match = cleaned.match(
    /^(.+?)\s+(?:a|en|para)\s+(?:la\s+)?mesa\s+(.+)$/,
  );
  if (!match) return null;

  const orderText = stripLeadingAddVerb(
    stripRedundantTrailingPackagingPhrase(
      stripSpeechDisfluencies(match[1]?.trim() ?? ""),
    ),
  );
  const tableQuery = normalizeTableQuery(match[2]?.trim() ?? "");
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
    /^(?:(?:abre|abrir|entra|entrar|ve|ir)\s+(?:a\s+)?(?:la\s+)?mesa|mesa)\s+(.+)$/,
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