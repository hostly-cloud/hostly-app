import assert from "node:assert/strict";
import test from "node:test";
import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type { AiImportV2ValidatedItem } from "@/lib/server/menu-imports/ai-import-v2/types";
import { recoverMultiPagePhotoVision } from "@/lib/server/menu-imports/ai-import-v2/recover-multi-page-photo-vision";

type RecoveryParams = Parameters<typeof recoverMultiPagePhotoVision>[0];
type RecoveryPage = RecoveryParams["pages"][number];
type ShadowRunner = NonNullable<RecoveryParams["runShadow"]>;

function item(name: string, price: number): ImportedMenuItem {
  return {
    id: `${name}-${price}`,
    sourceType: "image",
    name,
    price,
    sectionName: "General",
    suggestedCategory: "General",
    suggestedStation: "kitchen",
    confidence: 90,
    needsReview: false,
    selectedForPublish: true,
  };
}

function vision(name: string, price: number): AiImportV2ValidatedItem {
  return {
    name,
    description: "",
    translations: [],
    price,
    confidence: 0.94,
    sourceEvidence: [`${name} ${price}`],
    operationalSuggestion: {
      categoryType: "food",
      productFamilyType: "food",
      suggestedStation: "kitchen",
      confidence: 0.9,
    },
    sectionName: "General",
    validationStatus: "accepted",
    rejectionReasons: [],
    operationalWarnings: [],
  };
}

function page(index: number, items: ImportedMenuItem[]): RecoveryPage {
  return {
    source: {
      storagePath: `restaurants/r1/menu-imports/d1/pages/00${index + 1}.jpg`,
      originalFileName: `page-${index + 1}.jpg`,
      sourceType: "image" as const,
      order: index,
    },
    extraction: {
      rawText: items.map((row) => `${row.name} ${row.price}`).join("\n"),
      warnings: [],
    },
    parsed: {
      items,
      warnings: [],
    },
  } as RecoveryPage;
}

test("multi-page recovery is a no-op while the recovery flag is disabled", async () => {
  const previous = process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY;
  delete process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY;
  try {
    let calls = 0;
    const result = await recoverMultiPagePhotoVision({
      restaurantId: "r1",
      draftId: "d1",
      menuType: "mixed",
      pages: [page(0, [item("Burrata", 12)]), page(1, [item("Tartar", 14)])],
      runShadow: (async () => {
        calls += 1;
        return null;
      }) as ShadowRunner,
    });

    assert.equal(calls, 0);
    assert.equal(result.recoveredCount, 0);
    assert.equal(result.warnings.length, 0);
  } finally {
    if (previous == null) delete process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY;
    else process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY = previous;
  }
});

test("recovers vision candidates per page and preserves same-name different-price variants", async () => {
  const previous = process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY;
  process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY = "true";
  try {
    const result = await recoverMultiPagePhotoVision({
      restaurantId: "r1",
      draftId: "d1",
      menuType: "mixed",
      pages: [page(0, [item("Rioja", 5)]), page(1, [item("Croquetas", 9.5)])],
      runShadow: (async (params) => ({
        enabled: true,
        model: "test",
        apiMode: "chat_completions",
        usedVision: true,
        durationMs: 1,
        extraction: null,
        comparison: null,
        validation: {
          accepted: params.originalFileName === "page-1.jpg"
            ? [vision("Rioja", 6)]
            : [vision("Burrata", 12)],
          rejected: [],
          globalWarnings: [],
        },
      })) as ShadowRunner,
    });

    assert.equal(result.recoveredCount, 2);
    assert.deepEqual(
      result.pages[0].parsed.items.map((row) => [row.name, row.price]),
      [["Rioja", 5], ["Rioja", 6]],
    );
    assert.equal(result.pages[1].parsed.items.some((row) => row.name === "Burrata"), true);
    assert.equal(
      result.pages[0].parsed.items[1]?.aiWarnings?.includes("photo_vision_page_1"),
      true,
    );
    assert.deepEqual(result.warnings.sort(), [
      "photo_vision_page_1_recovered:1",
      "photo_vision_page_2_recovered:1",
    ]);
  } finally {
    if (previous == null) delete process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY;
    else process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY = previous;
  }
});

test("a page without actual vision cannot contribute recovered items", async () => {
  const previous = process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY;
  process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY = "true";
  try {
    const result = await recoverMultiPagePhotoVision({
      restaurantId: "r1",
      draftId: "d1",
      menuType: "mixed",
      pages: [page(0, [item("Burrata", 12)]), page(1, [item("Tartar", 14)])],
      runShadow: (async () => ({
        enabled: true,
        model: "test",
        apiMode: "chat_completions",
        usedVision: false,
        durationMs: 1,
        extraction: null,
        comparison: null,
        validation: {
          accepted: [vision("Inventado", 99)],
          rejected: [],
          globalWarnings: [],
        },
      })) as ShadowRunner,
    });

    assert.equal(result.recoveredCount, 0);
    assert.equal(result.pages.some((row) => row.parsed.items.some((candidate) => candidate.name === "Inventado")), false);
  } finally {
    if (previous == null) delete process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY;
    else process.env.HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY = previous;
  }
});
