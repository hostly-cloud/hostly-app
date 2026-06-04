/** Texto OCR mínimo para intentar extraer productos con confianza. */
export const MIN_OCR_SOURCE_TEXT_LENGTH = 40;

export type OcrValidationItem = {
  name: string;
};

export type OcrValidationResult<T extends OcrValidationItem> = {
  accepted: T[];
  rejected: T[];
  ocrTextLength: number;
};

export type OcrValidationDiagnostics = {
  ocrTextLength: number;
  aiReturnedCount: number;
  rejectedCount: number;
  acceptedCount: number;
  rejectedNames: string[];
  acceptedNames: string[];
};

/** Normaliza para comparación tolerante (acentos, mayúsculas, espacios, puntuación). */
export function normalizeForOcrMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactAlphanumeric(text: string): string {
  return normalizeForOcrMatch(text).replace(/\s/g, "");
}

function significantTokens(name: string): string[] {
  const norm = normalizeForOcrMatch(name);
  if (!norm) return [];
  return norm.split(" ").filter((t) => t.length >= 2);
}

/**
 * Comprueba si el nombre del producto está sustentado por el texto OCR.
 * Tolerante a OCR imperfecto; rechaza nombres totalmente ausentes del origen.
 */
export function isProductNameSupportedByOcr(productName: string, ocrSourceText: string): boolean {
  const name = productName.trim();
  if (name.length < 2) return false;

  const ocrNorm = normalizeForOcrMatch(ocrSourceText);
  const nameNorm = normalizeForOcrMatch(name);
  if (!ocrNorm || !nameNorm) return false;

  if (ocrNorm.includes(nameNorm)) return true;

  const nameCompact = compactAlphanumeric(name);
  const ocrCompact = compactAlphanumeric(ocrSourceText);
  if (nameCompact.length >= 3 && ocrCompact.includes(nameCompact)) return true;

  const tokens = significantTokens(name);
  if (tokens.length === 0) return false;

  const strong = tokens.filter((t) => t.length >= 4);
  if (strong.some((t) => ocrNorm.includes(t) || ocrCompact.includes(t))) return true;

  const medium = tokens.filter((t) => t.length >= 3);
  const matchedMedium = medium.filter((t) => ocrNorm.includes(t));
  if (medium.length > 0 && matchedMedium.length >= Math.max(1, Math.ceil(medium.length * 0.6))) {
    return true;
  }

  if (tokens.length === 1 && tokens[0].length >= 3) {
    return ocrNorm.includes(tokens[0]) || ocrCompact.includes(tokens[0]);
  }

  return false;
}

export function filterItemsByOcrSource<T extends OcrValidationItem>(
  items: T[],
  ocrSourceText: string,
): OcrValidationResult<T> {
  const ocrTextLength = ocrSourceText.trim().length;
  if (ocrTextLength < MIN_OCR_SOURCE_TEXT_LENGTH) {
    return { accepted: [], rejected: [...items], ocrTextLength };
  }

  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const item of items) {
    if (isProductNameSupportedByOcr(item.name, ocrSourceText)) accepted.push(item);
    else rejected.push(item);
  }
  return { accepted, rejected, ocrTextLength };
}

export function logOcrValidationDiagnostics(diag: OcrValidationDiagnostics, context: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[menu-import/ocr-validate] ${context}`, {
    ocrTextLength: diag.ocrTextLength,
    aiReturnedCount: diag.aiReturnedCount,
    acceptedCount: diag.acceptedCount,
    rejectedCount: diag.rejectedCount,
    acceptedNames: diag.acceptedNames.slice(0, 24),
    rejectedNames: diag.rejectedNames.slice(0, 24),
  });
}

/** Solo desarrollo: explica por qué un nombre pasa o no la validación OCR (sin cambiar reglas). */
export function explainOcrValidationDecision(
  productName: string,
  ocrSourceText: string,
): { accepted: boolean; reason: string; minOcrLength: number; ocrTextLength: number } {
  const ocrTextLength = ocrSourceText.trim().length;
  const minOcrLength = MIN_OCR_SOURCE_TEXT_LENGTH;
  if (ocrTextLength < minOcrLength) {
    return {
      accepted: false,
      reason: `ocr_text_too_short (< ${minOcrLength} chars)`,
      minOcrLength,
      ocrTextLength,
    };
  }
  if (isProductNameSupportedByOcr(productName, ocrSourceText)) {
    return { accepted: true, reason: "supported_by_ocr", minOcrLength, ocrTextLength };
  }

  const name = productName.trim();
  const ocrNorm = normalizeForOcrMatch(ocrSourceText);
  const nameNorm = normalizeForOcrMatch(name);
  if (!nameNorm) {
    return { accepted: false, reason: "empty_normalized_name", minOcrLength, ocrTextLength };
  }
  if (ocrNorm.includes(nameNorm)) {
    return { accepted: true, reason: "supported_by_ocr", minOcrLength, ocrTextLength };
  }

  const nameCompact = compactAlphanumeric(name);
  const ocrCompact = compactAlphanumeric(ocrSourceText);
  if (nameCompact.length >= 3 && ocrCompact.includes(nameCompact)) {
    return { accepted: true, reason: "supported_by_ocr_compact", minOcrLength, ocrTextLength };
  }

  const tokens = significantTokens(name);
  const strong = tokens.filter((t) => t.length >= 4);
  const strongMatched = strong.filter((t) => ocrNorm.includes(t) || ocrCompact.includes(t));
  if (strongMatched.length > 0) {
    return { accepted: true, reason: "supported_by_strong_token", minOcrLength, ocrTextLength };
  }

  const medium = tokens.filter((t) => t.length >= 3);
  const matchedMedium = medium.filter((t) => ocrNorm.includes(t));
  const requiredMedium = medium.length > 0 ? Math.max(1, Math.ceil(medium.length * 0.6)) : 0;
  if (medium.length > 0 && matchedMedium.length >= requiredMedium) {
    return { accepted: true, reason: "supported_by_medium_tokens", minOcrLength, ocrTextLength };
  }

  if (tokens.length === 1 && tokens[0].length >= 3 && ocrNorm.includes(tokens[0])) {
    return { accepted: true, reason: "supported_by_single_token", minOcrLength, ocrTextLength };
  }

  return {
    accepted: false,
    reason:
      medium.length > 0
        ? `name_not_in_ocr (tokens ${matchedMedium.length}/${medium.length}, need ${requiredMedium}; strong ${strongMatched.length}/${strong.length})`
        : `name_not_in_ocr (no significant tokens)`,
    minOcrLength,
    ocrTextLength,
  };
}
