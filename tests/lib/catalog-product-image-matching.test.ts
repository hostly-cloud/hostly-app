import assert from "node:assert/strict";
import test from "node:test";
import {
  CatalogProductImageProviderError,
  getOpenFoodFactsCandidateByCode,
  isAllowedOpenFoodFactsImageUrl,
  normalizeCatalogMatchText,
  rankOpenFoodFactsCandidate,
  searchOpenFoodFactsCatalog,
  type OpenFoodFactsRawCandidate,
} from "@/lib/server/product-images/open-food-facts-catalog";
import {
  catalogVariantConflicts,
  filterCatalogCandidatesByExactIdentity,
  getOpenFoodFactsCandidateByExactBarcode,
  normalizeCatalogBarcode,
} from "@/lib/server/product-images/open-food-facts-exact-product";
import { downloadOpenFoodFactsImage } from "@/lib/server/product-images/attach-catalog-product-image";

const IMAGE_URL =
  "https://images.openfoodfacts.org/images/products/544/900/013/1805/front_es.12.400.jpg";
const SMALL_IMAGE_URL =
  "https://images.openfoodfacts.org/images/products/544/900/013/1805/front_es.12.200.jpg";

function candidate(
  patch: Partial<OpenFoodFactsRawCandidate> = {},
): OpenFoodFactsRawCandidate {
  return {
    code: "5449000131805",
    productName: "Coca-Cola Zero",
    brand: "Coca-Cola",
    quantity: "330 ml",
    imageUrl: IMAGE_URL,
    thumbnailUrl: SMALL_IMAGE_URL,
    ...patch,
  };
}

function jsonFetch(
  body: unknown,
  capture?: (input: RequestInfo | URL, init?: RequestInit) => void,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    capture?.(input, init);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("normalizes accents and punctuation for deterministic matching", () => {
  assert.equal(
    normalizeCatalogMatchText("Vega Sicilia Único — 2018"),
    "vega sicilia unico 2018",
  );
});

test("normalizes EAN and GTIN punctuation without inventing digits", () => {
  assert.equal(normalizeCatalogBarcode("5 449-0001 31805"), "5449000131805");
  assert.equal(normalizeCatalogBarcode("abc"), null);
});

test("only accepts official Open Food Facts image hosts and product paths", () => {
  assert.equal(isAllowedOpenFoodFactsImageUrl(IMAGE_URL), true);
  assert.equal(
    isAllowedOpenFoodFactsImageUrl(
      "https://cdn.images.openfoodfacts.org/images/products/544/900/front.jpg",
    ),
    true,
  );
  assert.equal(
    isAllowedOpenFoodFactsImageUrl(
      "https://images.openfoodfacts.org.evil.example/images/products/544/front.jpg",
    ),
    false,
  );
  assert.equal(
    isAllowedOpenFoodFactsImageUrl(
      "https://images.openfoodfacts.org/static/logo.png",
    ),
    false,
  );
  assert.equal(
    isAllowedOpenFoodFactsImageUrl(
      "http://images.openfoodfacts.org/images/products/544/front.jpg",
    ),
    false,
  );
});

test("exact brand and equivalent 33 cl / 330 ml format is a strong candidate", () => {
  const ranked = rankOpenFoodFactsCandidate(
    candidate(),
    { name: "Coca-Cola Zero 33 cl" },
    "Coca-Cola Zero 33 cl",
  );

  assert.ok(ranked);
  assert.equal(ranked.matchLevel, "strong");
  assert.equal(ranked.confidence >= 0.88, true);
  assert.deepEqual(ranked.warnings, []);
});

test("different pack size remains visible only as a review candidate", () => {
  const ranked = rankOpenFoodFactsCandidate(
    candidate({ quantity: "500 ml" }),
    { name: "Coca-Cola Zero 33 cl" },
    "Coca-Cola Zero 33 cl",
  );

  assert.ok(ranked);
  assert.equal(ranked.matchLevel, "review");
  assert.match(ranked.warnings.join(" "), /cantidad|formato/i);
});

test("different wine vintage is rejected instead of being offered", () => {
  const ranked = rankOpenFoodFactsCandidate(
    candidate({
      code: "8410869450199",
      productName: "Vega Sicilia Único 2019",
      brand: "Vega Sicilia",
      quantity: "750 ml",
    }),
    { name: "Vega Sicilia Único 2018", quantity: "75 cl" },
    "Vega Sicilia Único 2018",
  );

  assert.equal(ranked, null);
});

test("unrelated products are filtered before reaching the UI", () => {
  const ranked = rankOpenFoodFactsCandidate(
    candidate({ productName: "Fanta Naranja", brand: "Fanta" }),
    { name: "Coca-Cola Zero 33 cl" },
    "Coca-Cola Zero 33 cl",
  );
  assert.equal(ranked, null);
});

test("critical commercial variants are rejected before reaching the UI", () => {
  const local = { name: "Red Bull 250 ml", brand: "Red Bull", quantity: "250 ml" };
  const peach = {
    provider: "open_food_facts" as const,
    externalReference: "90435843",
    productName: "The Peach Edition",
    brand: "Red Bull",
    quantity: "250 ml",
    imageUrl: IMAGE_URL,
    thumbnailUrl: SMALL_IMAGE_URL,
    sourceUrl: "https://world.openfoodfacts.org/product/90435843",
    confidence: 0.86,
    matchLevel: "review" as const,
    warnings: [],
    license: "CC BY-SA 3.0" as const,
    attribution: "Open Food Facts contributors" as const,
  };
  assert.deepEqual(catalogVariantConflicts({ context: local, candidate: peach }), [
    "peach",
  ]);
  assert.deepEqual(
    filterCatalogCandidatesByExactIdentity({ context: local, candidates: [peach] }),
    [],
  );
});

test("caffeine-free variant is rejected for a regular Coca-Cola Zero product", () => {
  const conflicts = catalogVariantConflicts({
    context: { name: "Coca-Cola Zero 33 cl", brand: "Coca-Cola" },
    candidate: {
      productName: "Coca-Cola Zero Sugar Kofeiiniton",
      brand: "Coca-Cola",
    },
  });
  assert.equal(conflicts.includes("caffeine_free"), true);
});

test("search uses POST JSON, minimal fields and parses Search-a-licious hits", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl = jsonFetch(
    {
      hits: [
        {
          fields: {
            code: ["5449000131805"],
            product_name_es: ["Coca-Cola Zero"],
            brands: ["Coca-Cola"],
            quantity: ["330 ml"],
            image_front_url: [IMAGE_URL],
            image_front_small_url: [SMALL_IMAGE_URL],
          },
        },
      ],
      count: 1,
      page: 1,
      page_size: 12,
    },
    (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
    },
  );

  const result = await searchOpenFoodFactsCatalog({
    query: "Coca-Cola Zero 33 cl",
    context: { name: "Coca-Cola Zero 33 cl" },
    fetchImpl,
  });

  assert.equal(capturedUrl, "https://search.openfoodfacts.org/search");
  assert.equal(capturedInit?.method, "POST");
  const headers = new Headers(capturedInit?.headers);
  assert.match(headers.get("user-agent") ?? "", /Hostly\/1\.0/);
  const payload = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.equal(payload.q, "Coca-Cola Zero 33 cl");
  assert.equal(payload.page_size, 12);
  assert.equal(Array.isArray(payload.fields), true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.externalReference, "5449000131805");
  assert.equal(result.license, "CC BY-SA 3.0");
});

test("exact barcode lookup uses the product API instead of text search", async () => {
  let capturedUrl = "";
  let capturedMethod = "";
  const exact = await getOpenFoodFactsCandidateByExactBarcode({
    barcode: "5449000131805",
    context: {
      name: "Coca-Cola Zero 33 cl",
      brand: "Coca-Cola",
      quantity: "33 cl",
      barcode: "5449000131805",
    },
    fetchImpl: jsonFetch(
      {
        code: "5449000131805",
        product: {
          code: "5449000131805",
          product_name: "Coca-Cola Zero",
          brands: "Coca-Cola",
          quantity: "330 ml",
          image_front_url: IMAGE_URL,
          image_front_small_url: SMALL_IMAGE_URL,
        },
      },
      (input, init) => {
        capturedUrl = String(input);
        capturedMethod = init?.method ?? "GET";
      },
    ),
  });

  assert.ok(exact);
  assert.match(capturedUrl, /\/api\/v3\/product\/5449000131805/);
  assert.equal(capturedMethod, "GET");
  assert.equal(exact.externalReference, "5449000131805");
  assert.equal(exact.matchLevel, "strong");
  assert.equal(exact.confidence, 1);
});

test("exact barcode lookup preserves human review when saved format conflicts", async () => {
  const exact = await getOpenFoodFactsCandidateByExactBarcode({
    barcode: "5449000131805",
    context: {
      name: "Coca-Cola Zero 50 cl",
      brand: "Coca-Cola",
      quantity: "500 ml",
      barcode: "5449000131805",
    },
    fetchImpl: jsonFetch({
      code: "5449000131805",
      product: {
        code: "5449000131805",
        product_name: "Coca-Cola Zero",
        brands: "Coca-Cola",
        quantity: "330 ml",
        image_front_url: IMAGE_URL,
        image_front_small_url: SMALL_IMAGE_URL,
      },
    }),
  });

  assert.ok(exact);
  assert.equal(exact.matchLevel, "review");
  assert.match(exact.warnings.join(" "), /formato/i);
});

test("exact barcode lookup rejects a reference different from the stored barcode", async () => {
  await assert.rejects(
    () =>
      getOpenFoodFactsCandidateByExactBarcode({
        barcode: "5449000131805",
        context: {
          name: "Coca-Cola Zero",
          barcode: "8410793282934",
        },
        fetchImpl: jsonFetch({}),
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CATALOG_BARCODE_MISMATCH",
  );
});

test("selected barcode is resolved again from the provider before attach", async () => {
  let query = "";
  const selected = await getOpenFoodFactsCandidateByCode({
    code: "5449000131805",
    context: { name: "Coca-Cola Zero 33 cl" },
    fetchImpl: jsonFetch(
      {
        hits: [
          {
            code: "5449000131805",
            product_name: "Coca-Cola Zero",
            brands: "Coca-Cola",
            quantity: "330 ml",
            image_front_url: IMAGE_URL,
            image_front_small_url: SMALL_IMAGE_URL,
          },
        ],
      },
      (_input, init) => {
        const payload = JSON.parse(String(init?.body)) as { q?: string };
        query = payload.q ?? "";
      },
    ),
  });

  assert.equal(query, 'code:"5449000131805"');
  assert.equal(selected.externalReference, "5449000131805");
});

test("provider rate limit is preserved as a structured error", async () => {
  const fetchImpl = (async () =>
    new Response("{}", { status: 429 })) as typeof fetch;

  await assert.rejects(
    () =>
      searchOpenFoodFactsCatalog({
        query: "Coca-Cola",
        context: { name: "Coca-Cola" },
        fetchImpl,
      }),
    (error: unknown) =>
      error instanceof CatalogProductImageProviderError &&
      error.code === "CATALOG_PROVIDER_RATE_LIMITED" &&
      error.httpStatus === 429,
  );
});

test("catalog image download rejects arbitrary URLs before making a request", async () => {
  let called = false;
  await assert.rejects(
    () =>
      downloadOpenFoodFactsImage({
        imageUrl: "https://example.com/product.jpg",
        fetchImpl: (async () => {
          called = true;
          return new Response();
        }) as typeof fetch,
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CATALOG_IMAGE_URL_NOT_ALLOWED",
  );
  assert.equal(called, false);
});

test("catalog image download validates image type and size", async () => {
  const bytes = new Uint8Array([255, 216, 255, 224]);
  const fetchImpl = (async () =>
    new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(bytes.length),
      },
    })) as typeof fetch;

  const downloaded = await downloadOpenFoodFactsImage({
    imageUrl: IMAGE_URL,
    fetchImpl,
  });
  assert.equal(downloaded.contentType, "image/jpeg");
  assert.equal(downloaded.extension, "jpg");
  assert.equal(downloaded.bytes.length, bytes.length);
});
