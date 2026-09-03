export type CommercialNameNormalization = {
  rawName: string;
  commercialName: string;
  descriptionFromName: string;
  nameNormalizationReason: string;
};

export type RejectedNameCandidate = {
  line: string;
  reason: string;
};

export type PreferredProductNameResolution = {
  name: string;
  description: string;
  selectedLine: string;
  selectedReason: string;
  rejectedCandidates: RejectedNameCandidate[];
};

const DISH_TYPE_WORDS =
  /\b(spaghetti|linguine|penne|rigatoni|orecchiette|risotto|tagliatelle|fettuccine|ravioli|gnocchi|pizza|pizze|margherita|calzone|salmone|tonno|branzino|manzo|vitello|pollo|entrec[oô]t|filetto|gamberi|calamari|tiramis[uù]|croquetas|ensalada|tapa|langostinos|chuletas|escalopes|solomillo|muslo|estofado|dorada|lubina|ternera|cordero|cerdo)\b/i;

const DISH_STYLE_WORDS =
  /\b(carbonara|arrabiata|bolognesa|boloñesa|amatriciana|pesto|marinara|puttanesca|norma|capricciosa|diavola|quattro|formaggi|prosciutto|bufala)\b/i;

const TRANSLATION_EN_RE =
  /\b(with|and|style|sauce|spicy|cream|cheese|mushroom|mushrooms|shrimp|shrimps|cherry|cherries|seafood|tomato|served|style|pork|baked|grilled|beef|chicken|lamb|prawns?|scallops?|fillet|escalopes?|au gratin)\b/i;

const TRANSLATION_DE_RE =
  /\b(mit|und|scharfer|scharfe|Tomatensauce|pilz|pilze|Pilzen|Meeresfrüchte|Garnelen|Kirschen|stil|prosecco|serviert|kirschtomaten|büffel|salbei|steinpilz|frische|frisch|frischem|salbeibutter|gemischten|sahne|spinat|lauch|garnelen|geräuchertem|trüffel|gebackenes|wildes|Schweinekoteletts|Lammkoteletts|Doradenfilet)\b/i;

const PRIMARY_ES_IT_RE =
  /\b(con|de|la|el|los|las|salsa|tomate|picante|estilo|langostinos|chuletas|setas|frutos|mar|gratinados|servidos|escalopes|filete|solomillo|muslo|estofado|dorada|lubina|ternera|cordero|cerdo|tzatziki|plancha|parrilla|horno|vino|al|alla|pollo|feliz|estrag[oó]n|deshuesado|nacional)\b/i;

const INVALID_PRIMARY_START_RE =
  /^(con|de|del|la|el|los|las|with|mit|avec|served|serviert|servido|servidos|and|the|pork|baked|grilled|fillet|gebackenes|\/\/|puis|per)\b/i;

const EN_PRIMARY_START_RE =
  /^(pork|baked|grilled|beef|chicken|lamb|prawns?|scallops?|fillet|escalopes?|lamb chops)\b/i;

const FRAGMENT_ONLY_RE =
  /^(gratinados?,?\s+servidos?|de cordero|con salsa|gebackenes wildes|chops in)\b/i;

const SPANISH_DISH_PREFIX_RE =
  /^(langostinos|chuletas|escalopes?|escalopines|filete|solomillo|muslo|estofado)\b/i;

const EN_DE_ROW_LEADER_RE =
  /^(gratinated|gratinierte|lamb|pork|baked|grilled|beef|king|riesengarnelen|schwein|gebackenes|freerange|freiland)\b/i;

const DESCRIPTION_CONNECTORS: Array<{ pattern: RegExp }> = [
  { pattern: /\s+en\s+salsa\s+/i },
  { pattern: /\s+estilo\s+/i },
  { pattern: /\s+style\s+/i },
  { pattern: /\s+stil\s+/i },
  { pattern: /\s+mit\s+/gi },
  { pattern: /\s+avec\s+/gi },
];

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function polishCommercialName(name: string): string {
  const lowerParticles = new Set(["al", "con", "de", "del", "la", "el", "y", "a", "e", "o"]);
  return tokenize(name)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && lowerParticles.has(lower)) return lower;
      if (DISH_STYLE_WORDS.test(word)) return capitalizeWord(word);
      if (index === 0 || DISH_TYPE_WORDS.test(word)) return capitalizeWord(word);
      return lower;
    })
    .join(" ");
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function scoreSpanishLine(line: string): number {
  let score = 0;
  const lower = line.toLowerCase();
  if (/[áéíóúñÁÉÍÓÚÑ]/.test(line)) score += 12;
  if (PRIMARY_ES_IT_RE.test(lower)) score += 10;
  if (DISH_TYPE_WORDS.test(line)) score += 8;
  if (/^(langostinos|chuletas|escalopes|filete|solomillo|muslo|estofado)\b/i.test(line)) score += 15;
  if (line.length >= 28) score += 6;
  if (line.length >= 45) score += 4;
  return score;
}

function scoreEnglishLine(line: string): number {
  let score = 0;
  if (TRANSLATION_EN_RE.test(line)) score += 8;
  if (EN_PRIMARY_START_RE.test(line)) score += 12;
  if (!/[áéíóúñ]/i.test(line) && /^[A-Za-z\s,'-]+$/.test(line)) score += 4;
  return score;
}

function scoreGermanLine(line: string): number {
  let score = 0;
  if (TRANSLATION_DE_RE.test(line)) score += 8;
  if (/[äöüß]/i.test(line)) score += 6;
  return score;
}

function isFragmentLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 12) return true;
  if (INVALID_PRIMARY_START_RE.test(t)) return true;
  if (FRAGMENT_ONLY_RE.test(t)) return true;
  if (/^\/\//.test(t)) return true;
  if (t.split(/\s+/).length <= 2 && !DISH_TYPE_WORDS.test(t)) return true;
  return false;
}

function isContinuationLine(line: string): boolean {
  return /^(con|servido|servidos|mit|with|and)\b/i.test(line.trim());
}

/**
 * Une líneas partidas del OCR (p. ej. nombre + "con salsa…" en línea siguiente).
 */
/** Une prefijo español en columna izquierda con continuación en la misma fila OCR. */
function mergeDishPrefixLines(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i]!.trim();
    const words = tokenize(cur);
    if (words.length === 1 && SPANISH_DISH_PREFIX_RE.test(cur) && i + 1 < lines.length) {
      const next = lines[i + 1]!.trim();
      if (!EN_DE_ROW_LEADER_RE.test(next) && !INVALID_PRIMARY_START_RE.test(next)) {
        out.push(`${cur} ${next}`);
        i += 2;
        continue;
      }
    }
    out.push(cur);
    i += 1;
  }
  return out;
}

function mergeContinuationLines(lines: string[]): string[] {
  const merged: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (merged.length > 0 && isContinuationLine(t)) {
      const prev = merged[merged.length - 1]!;
      if (scoreSpanishLine(prev) >= scoreEnglishLine(prev)) {
        merged[merged.length - 1] = `${prev} ${t}`;
        continue;
      }
    }
    merged.push(t);
  }
  return merged;
}

function scoreCandidateLine(line: string, hasSpanishCandidate: boolean): { score: number; rejectReason?: string } {
  const t = line.trim();
  if (!t || t.length < 6) return { score: -100, rejectReason: "too_short" };
  if (/^\/\//.test(t)) return { score: -100, rejectReason: "noise_marker" };
  if (isFragmentLine(t)) return { score: -80, rejectReason: "fragment_or_connector_start" };

  let score = 0;
  const es = scoreSpanishLine(t);
  const en = scoreEnglishLine(t);
  const de = scoreGermanLine(t);

  score += es;
  if (hasSpanishCandidate) {
    score -= en * 2;
    score -= de * 2;
  } else {
    score += en * 0.5;
    score += de * 0.3;
  }

  if (en > es && hasSpanishCandidate) return { score: -60, rejectReason: "english_when_spanish_available" };
  if (de > es && hasSpanishCandidate && es < 8) return { score: -50, rejectReason: "german_when_spanish_available" };

  score += Math.min(t.length / 8, 12);

  return { score };
}

function splitNameAtDescriptionConnector(text: string): { name: string; description: string } | null {
  let best: { name: string; description: string } | null = null;
  for (const { pattern } of DESCRIPTION_CONNECTORS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(re)) {
      if (match.index == null || match.index === 0) continue;
      const name = text.slice(0, match.index).trim();
      const description = text.slice(match.index).trim();
      if (name.length < 8 || tokenize(name).length < 2) continue;
      if (INVALID_PRIMARY_START_RE.test(name)) continue;
      if (/\b(servidos?|servido|gratinados?|fritas?)\s*,?\s*$/i.test(name)) continue;
      if (!best || name.length > best.name.length) {
        best = { name, description };
      }
    }
  }
  return best;
}

function isValidCommercialNameAfterSplit(name: string): boolean {
  const words = tokenize(name);
  if (words.length >= 2) return name.trim().length >= 8;
  return DISH_TYPE_WORDS.test(name) && name.trim().length >= 6;
}

/**
 * Elige el nombre principal de un bloque visual multilingüe.
 */
export function isRejectedVisualPrimaryFragment(text: string): boolean {
  return isFragmentLine(text.trim());
}

export function resolvePreferredProductNameFromVisualBlock(
  candidateLines: string[],
): PreferredProductNameResolution {
  const merged = mergeContinuationLines(
    mergeDishPrefixLines(dedupeLines(candidateLines.filter(Boolean))),
  );
  const hasSpanishCandidate = merged.some((line) => scoreSpanishLine(line) >= 10);

  const rejectedCandidates: RejectedNameCandidate[] = [];
  let bestLine = "";
  let bestScore = -Infinity;
  let bestReason = "kept_longest_spanish_line";

  for (const line of merged) {
    const { score, rejectReason } = scoreCandidateLine(line, hasSpanishCandidate);
    if (rejectReason && score < 0) {
      rejectedCandidates.push({ line, reason: rejectReason });
      continue;
    }
    if (score > bestScore || (score === bestScore && line.length > bestLine.length)) {
      bestScore = score;
      bestLine = line;
      bestReason =
        scoreSpanishLine(line) >= 10
          ? "preferred_spanish_primary_line"
          : scoreEnglishLine(line) > scoreGermanLine(line)
            ? "fallback_english_line"
            : "fallback_german_or_other_line";
    }
  }

  if (!bestLine && merged.length > 0) {
    bestLine = [...merged].sort((a, b) => b.length - a.length)[0]!;
    bestReason = "fallback_longest_line";
  }

  const split = splitNameAtDescriptionConnector(bestLine);
  if (split && isValidCommercialNameAfterSplit(split.name)) {
    return {
      name: polishCommercialName(split.name),
      description: split.description,
      selectedLine: bestLine,
      selectedReason: "split_description_connector",
      rejectedCandidates,
    };
  }

  return {
    name: polishCommercialName(bestLine),
    description: "",
    selectedLine: bestLine,
    selectedReason: bestReason,
    rejectedCandidates,
  };
}

function buildDescriptionFromRemainder(allLines: string[], commercialName: string): string {
  const parts: string[] = [];
  const commercialLower = commercialName.toLowerCase();
  for (const line of allLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === commercialLower) continue;
    if (trimmed.toLowerCase().startsWith(commercialLower)) {
      const rest = trimmed.slice(commercialName.length).replace(/^[\s,;:-]+/, "").trim();
      if (rest) parts.push(rest);
    }
  }
  return [...new Set(parts)].join(" / ").slice(0, 280);
}

/**
 * Normaliza el nombre comercial de un bloque visual OCR sin inventar texto nuevo.
 */
export function normalizeVisualCommercialName(
  nameLine: string,
  translationLines: string[],
  blockCandidateLines: string[] = [],
): CommercialNameNormalization {
  const rawName = nameLine.trim();
  const allLines = dedupeLines([rawName, ...translationLines, ...blockCandidateLines]);
  const resolution = resolvePreferredProductNameFromVisualBlock(allLines);

  const description =
    resolution.description ||
    buildDescriptionFromRemainder(
      allLines.filter((l) => l.trim() !== resolution.selectedLine),
      resolution.name,
    );

  return {
    rawName,
    commercialName: resolution.name,
    descriptionFromName: description,
    nameNormalizationReason: resolution.selectedReason,
  };
}
