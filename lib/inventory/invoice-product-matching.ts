import type {

  ExtractedSupplierInvoiceDraft,

  ExtractedSupplierInvoiceLine,

  ExtractedSupplierInvoiceLineStatus,

} from "@/lib/inventory/extracted-supplier-invoice-types";

import type { SupplierProductAliasMatchCandidate } from "@/lib/inventory/supplier-product-alias-types";



export type InventoryProductMatchCandidate = {

  id: string;

  name: string;

};



const MATCHED_THRESHOLD = 0.75;

const AMBIGUOUS_THRESHOLD = 0.45;



export function normalizeSupplierProductText(text: string): string {

  return text

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .toLowerCase()

    .replace(/[^a-z0-9\s]/g, " ")

    .replace(/\s+/g, " ")

    .trim();

}



function tokenize(text: string): string[] {

  return normalizeSupplierProductText(text)

    .split(" ")

    .filter((token) => token.length > 1);

}



export function calculateProductMatchConfidence(

  detectedName: string,

  productName: string,

): number {

  const left = normalizeSupplierProductText(detectedName);

  const right = normalizeSupplierProductText(productName);

  if (!left || !right) return 0;

  if (left === right) return 1;



  if (left.includes(right) || right.includes(left)) {

    const shorter = Math.min(left.length, right.length);

    const longer = Math.max(left.length, right.length);

    return 0.82 + (shorter / longer) * 0.12;

  }



  const leftTokens = new Set(tokenize(left));

  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;



  let intersection = 0;

  for (const token of leftTokens) {

    if (rightTokens.has(token)) intersection += 1;

  }

  const union = leftTokens.size + rightTokens.size - intersection;

  const jaccard = union > 0 ? intersection / union : 0;



  const allLeftInRight = [...leftTokens].every((token) => rightTokens.has(token));

  const allRightInLeft = [...rightTokens].every((token) => leftTokens.has(token));

  const allTokensBonus = allLeftInRight || allRightInLeft ? 0.14 : 0;



  const firstLeft = [...leftTokens][0];

  const firstRight = [...rightTokens][0];

  const prefixBonus =

    firstLeft && firstRight && (firstLeft.startsWith(firstRight) || firstRight.startsWith(firstLeft))

      ? 0.08

      : 0;



  return Math.min(1, jaccard + allTokensBonus + prefixBonus);

}



export function resolveProductMatchStatus(

  confidence: number,

): ExtractedSupplierInvoiceLineStatus {

  if (confidence >= MATCHED_THRESHOLD) return "matched";

  if (confidence >= AMBIGUOUS_THRESHOLD) return "ambiguous";

  return "unmatched";

}



function buildAliasLookup(

  aliases: readonly SupplierProductAliasMatchCandidate[],

): Map<string, SupplierProductAliasMatchCandidate> {

  const map = new Map<string, SupplierProductAliasMatchCandidate>();

  for (const alias of aliases) {

    const key = alias.normalizedText.trim();

    if (key) map.set(key, alias);

  }

  return map;

}



export function findSupplierProductAliasMatch(

  detectedName: string,

  aliases: readonly SupplierProductAliasMatchCandidate[],

): {

  productId: string;

  productName: string;

  confidence: number;

  status: ExtractedSupplierInvoiceLineStatus;

} | null {

  const normalized = normalizeSupplierProductText(detectedName);

  if (!normalized || aliases.length === 0) return null;



  const lookup = buildAliasLookup(aliases);

  const alias = lookup.get(normalized);

  if (!alias) return null;



  return {

    productId: alias.inventoryProductId,

    productName: alias.inventoryProductName,

    confidence: 1,

    status: "matched",

  };

}



export function findInventoryProductMatch(

  detectedName: string,

  products: readonly InventoryProductMatchCandidate[],

  aliases: readonly SupplierProductAliasMatchCandidate[] = [],

): {

  productId: string;

  productName: string;

  confidence: number;

  status: ExtractedSupplierInvoiceLineStatus;

} | null {

  const aliasMatch = findSupplierProductAliasMatch(detectedName, aliases);

  if (aliasMatch) return aliasMatch;



  const query = detectedName.trim();

  if (!query || products.length === 0) return null;



  let best: {

    productId: string;

    productName: string;

    confidence: number;

  } | null = null;



  for (const product of products) {

    const confidence = calculateProductMatchConfidence(query, product.name);

    if (!best || confidence > best.confidence) {

      best = {

        productId: product.id,

        productName: product.name,

        confidence,

      };

    }

  }



  if (!best || best.confidence < AMBIGUOUS_THRESHOLD) return null;



  return {

    ...best,

    status: resolveProductMatchStatus(best.confidence),

  };

}



function collectLineMatchTexts(line: ExtractedSupplierInvoiceLine): string[] {

  const texts = [line.rawText, line.detectedProductName]

    .map((value) => value?.trim())

    .filter((value): value is string => Boolean(value));

  return [...new Set(texts)];

}



export function enrichExtractedLineWithProductMatch(

  line: ExtractedSupplierInvoiceLine,

  products: readonly InventoryProductMatchCandidate[],

  aliases: readonly SupplierProductAliasMatchCandidate[] = [],

): ExtractedSupplierInvoiceLine {

  for (const text of collectLineMatchTexts(line)) {

    const aliasMatch = findSupplierProductAliasMatch(text, aliases);

    if (aliasMatch) {

      return {

        ...line,

        matchedInventoryProductId: aliasMatch.productId,

        matchedInventoryProductName: aliasMatch.productName,

        confidence: aliasMatch.confidence,

        status: aliasMatch.status,

      };

    }

  }



  const detected = line.detectedProductName?.trim() || line.rawText?.trim() || "";

  const match = findInventoryProductMatch(detected, products, aliases);

  if (!match) {

    return {

      ...line,

      matchedInventoryProductId: undefined,

      matchedInventoryProductName: undefined,

      confidence: line.confidence ?? 0,

      status: "unmatched",

    };

  }



  return {

    ...line,

    matchedInventoryProductId: match.productId,

    matchedInventoryProductName: match.productName,

    confidence: match.confidence,

    status: match.status,

  };

}



export function enrichExtractedDraftWithProductMatches(

  draft: ExtractedSupplierInvoiceDraft,

  products: readonly InventoryProductMatchCandidate[],

  aliases: readonly SupplierProductAliasMatchCandidate[] = [],

): ExtractedSupplierInvoiceDraft {

  return {

    ...draft,

    lines: draft.lines.map((line) =>

      enrichExtractedLineWithProductMatch(line, products, aliases),

    ),

  };

}


