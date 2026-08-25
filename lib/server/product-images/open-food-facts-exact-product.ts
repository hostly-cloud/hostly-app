import type { CatalogProductImageCandidate } from "@/lib/productos/catalog-product-image-contract";
import {
  isAllowedOpenFoodFactsImageUrl,
  normalizeCatalogMatchText,
  type CatalogProductMatchContext,
} from "@/lib/server/product-images/open-food-facts-catalog";

const OPEN_FOOD_FACTS_PRODUCT_API = "https://world.openfoodfacts.org/api/v3/product";
const OPEN_FOOD_FACTS_PRODUCT_URL = "https://world.openfoodfacts.org/product";
const OPEN_FOOD_FACTS_TIMEOUT_MS = 12_000;
const OPEN_FOOD_FACTS_LICENSE = "CC BY-SA 3.0" as const;
const OPEN_FOOD_FACTS_ATTRIBUTION = "Open Food Facts contributors" as const;

export class ExactCatalogProductError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ExactCatalogProductError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function normalizeCatalogBarcode(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return /^\d{4,24}$/.test(digits) ? digits : null;
}

function openFoodFactsUserAgent(): string {
  return (
    process.env.HOSTLY_OPENFOODFACTS_USER_AGENT?.trim() ||
    "Hostly/1.0 (contact@hostlyapp.app)"
  );
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const read = readString(value);
    if (read) return read;
  }
  return null;
}

function quantityTokens(value: string): string[] {
  const normalized = value.toLowerCase().replace(/,/g, ".");
  const tokens: string[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(ml|cl|l|g|kg)\b/g;
  for (const match of normalized.matchAll(pattern)) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (unit === "l") tokens.push(`${Math.round(amount * 1000)}ml`);
    else if (unit === "cl") tokens.push(`${Math.round(amount * 10)}ml`);
    else if (unit === "kg") tokens.push(`${Math.round(amount * 1000)}g`);
    else tokens.push(`${Math.round(amount)}${unit}`);
  }
  return [...new Set(tokens)];
}

const VARIANT_GROUPS: Array<{ id: string; tokens: string[] }> = [
  { id: "zero", tokens: ["zero", "zero sugar", "sin azucar", "sugar free"] },
  { id: "light", tokens: ["light", "diet"] },
  {
    id: "caffeine_free",
    tokens: [
      "sin cafeina",
      "caffeine free",
      "caffeine-free",
      "decaf",
      "decaffeinated",
      "kofeiiniton",
    ],
  },
  { id: "peach", tokens: ["peach", "melocoton", "fersken"] },
  { id: "tropical", tokens: ["tropical"] },
  { id: "watermelon", tokens: ["watermelon", "sandia"] },
  { id: "blueberry", tokens: ["blueberry", "arandano"] },
  { id: "apricot", tokens: ["apricot", "albaricoque"] },
  { id: "strawberry", tokens: ["strawberry", "fresa"] },
  { id: "coconut", tokens: ["coconut", "coco"] },
  { id: "pear", tokens: ["pear", "pera"] },
  { id: "lime", tokens: ["lime", "lima"] },
  { id: "lemon", tokens: ["lemon", "limon"] },
  { id: "orange", tokens: ["orange", "naranja"] },
  { id: "cherry", tokens: ["cherry", "cereza"] },
  { id: "grape", tokens: ["grape", "uva"] },
  { id: "mango", tokens: ["mango"] },
  { id: "apple", tokens: ["apple", "manzana"] },
];

function variantSignals(value: string): Set<string> {
  const normalized = ` ${normalizeCatalogMatchText(value)} `;
  const found = new Set<string>();
  for (const group of VARIANT_GROUPS) {
    if (
      group.tokens.some((token) => {
        const normalizedToken = normalizeCatalogMatchText(token);
        return normalizedToken && normalized.includes(` ${normalizedToken} `);
      })
    ) {
      found.add(group.id);
    }
  }
  return found;
}

export function catalogVariantConflicts(params: {
  context: CatalogProductMatchContext;
  candidate: Pick<CatalogProductImageCandidate, "productName" | "brand">;
}): string[] {
  const local = variantSignals(
    `${params.context.name} ${params.context.brand ?? ""} ${params.context.description ?? ""}`,
  );
  const remote = variantSignals(
    `${params.candidate.productName} ${params.candidate.brand ?? ""}`,
  );

  const conflicts: string[] = [];
  for (const signal of remote) {
    if (!local.has(signal)) conflicts.push(signal);
  }
  for (const signal of local) {
    if (!remote.has(signal)) conflicts.push(signal);
  }
  return [...new Set(conflicts)];
}

export function filterCatalogCandidatesByExactIdentity(params: {
  context: CatalogProductMatchContext;
  candidates: CatalogProductImageCandidate[];
}): CatalogProductImageCandidate[] {
  return params.candidates.filter(
    (candidate) =>
      catalogVariantConflicts({ context: params.context, candidate }).length === 0,
  );
}

function quantityWarnings(
  expected: string | null | undefined,
  actual: string | null,
): string[] {
  const expectedTokens = quantityTokens(expected ?? "");
  if (expectedTokens.length === 0) return [];
  const actualTokens = quantityTokens(actual ?? "");
  if (actualTokens.length === 0) {
    return ["El código de barras es exacto, pero el catálogo no confirma el formato."];
  }
  if (!expectedTokens.some((token) => actualTokens.includes(token))) {
    return ["El código de barras es exacto, pero el formato guardado en Hostly difiere del catálogo."];
  }
  return [];
}

export async function getOpenFoodFactsCandidateByExactBarcode(params: {
  barcode: string;
  context: CatalogProductMatchContext;
  fetchImpl?: typeof fetch;
}): Promise<CatalogProductImageCandidate | null> {
  const barcode = normalizeCatalogBarcode(params.barcode);
  if (!barcode) {
    throw new ExactCatalogProductError(
      "INVALID_CATALOG_BARCODE",
      "Código de barras inválido",
      400,
    );
  }

  const contextBarcode = normalizeCatalogBarcode(params.context.barcode);
  if (contextBarcode && contextBarcode !== barcode) {
    throw new ExactCatalogProductError(
      "CATALOG_BARCODE_MISMATCH",
      "La referencia seleccionada no coincide con el código de barras guardado en Hostly",
      409,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_FOOD_FACTS_TIMEOUT_MS);
  const fields = [
    "code",
    "product_name",
    "product_name_es",
    "product_name_en",
    "brands",
    "quantity",
    "image_front_url",
    "image_front_small_url",
  ].join(",");

  try {
    const response = await (params.fetchImpl ?? fetch)(
      `${OPEN_FOOD_FACTS_PRODUCT_API}/${encodeURIComponent(barcode)}?fields=${encodeURIComponent(fields)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": openFoodFactsUserAgent(),
        },
        signal: controller.signal,
      },
    );

    if (response.status === 404) return null;
    if (response.status === 429) {
      throw new ExactCatalogProductError(
        "CATALOG_PROVIDER_RATE_LIMITED",
        "Open Food Facts ha limitado temporalmente las consultas",
        429,
      );
    }
    if (!response.ok) {
      throw new ExactCatalogProductError(
        "CATALOG_PROVIDER_FAILED",
        `Open Food Facts product lookup failed (${response.status})`,
        502,
      );
    }

    const body = (await response.json().catch(() => null)) as
      | { code?: unknown; product?: Record<string, unknown> }
      | null;
    const product = body?.product;
    if (!product || typeof product !== "object") return null;

    const code = normalizeCatalogBarcode(readFirstString(product.code, body?.code));
    if (!code || code !== barcode) return null;

    const productName = readFirstString(
      product.product_name_es,
      product.product_name,
      product.product_name_en,
    );
    const imageUrl = readFirstString(product.image_front_url);
    const thumbnailUrl = readFirstString(product.image_front_small_url, imageUrl);
    if (!productName || !imageUrl || !thumbnailUrl) return null;
    if (!isAllowedOpenFoodFactsImageUrl(imageUrl)) return null;
    if (!isAllowedOpenFoodFactsImageUrl(thumbnailUrl)) return null;

    const brand = readFirstString(product.brands);
    const quantity = readFirstString(product.quantity);
    const baseCandidate = {
      provider: "open_food_facts" as const,
      externalReference: code,
      productName,
      brand,
      quantity,
      imageUrl,
      thumbnailUrl,
      sourceUrl: `${OPEN_FOOD_FACTS_PRODUCT_URL}/${encodeURIComponent(code)}`,
      license: OPEN_FOOD_FACTS_LICENSE,
      attribution: OPEN_FOOD_FACTS_ATTRIBUTION,
    };

    const variantConflicts = catalogVariantConflicts({
      context: params.context,
      candidate: baseCandidate,
    });
    const warnings = [
      ...quantityWarnings(params.context.quantity, quantity),
      ...(variantConflicts.length > 0
        ? [
            "El código de barras es exacto, pero la variante textual difiere; revisa los datos del producto.",
          ]
        : []),
    ];

    return {
      ...baseCandidate,
      confidence: warnings.length === 0 ? 1 : 0.96,
      matchLevel: warnings.length === 0 ? "strong" : "review",
      warnings,
    };
  } catch (error) {
    if (error instanceof ExactCatalogProductError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ExactCatalogProductError(
        "CATALOG_PROVIDER_TIMEOUT",
        "La consulta exacta por código de barras agotó el tiempo disponible",
        504,
      );
    }
    throw new ExactCatalogProductError(
      "CATALOG_PROVIDER_FAILED",
      "No se pudo consultar el producto por código de barras",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}
