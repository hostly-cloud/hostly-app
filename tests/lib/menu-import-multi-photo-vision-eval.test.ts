import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMultiPhotoVisionBatch,
  summarizeMultiPhotoVisionEvaluation,
} from "@/lib/menu-import-eval/multi-photo-vision-eval";

test("evaluates final batch identity after exact cross-page deduplication", () => {
  const result = evaluateMultiPhotoVisionBatch({
    id: "batch-1",
    pages: [
      {
        id: "page-1",
        expected: [
          { name: "Burrata", price: 12 },
          { name: "Rioja", price: 5 },
        ],
        parser: [{ name: "Burrata", price: 12 }],
        vision: [
          { name: "Burrata", price: 12 },
          { name: "Rioja", price: 5 },
        ],
      },
      {
        id: "page-2",
        expected: [
          { name: "Burrata", price: 12 },
          { name: "Rioja", price: 6 },
        ],
        parser: [{ name: "Rioja", price: 6 }],
        vision: [
          { name: "Burrata", price: 12 },
          { name: "Rioja", price: 6 },
        ],
      },
    ],
  });

  assert.equal(result.pageCount, 2);
  assert.equal(result.expectedCount, 3);
  assert.equal(result.expectedExactDuplicatesAcrossPages, 1);
  assert.equal(result.expectedSameNameDifferentPriceVariants, 1);
  assert.equal(result.parserRecall, 2 / 3);
  assert.equal(result.visionRecall, 1);
  assert.equal(result.visionPrecision, 1);
  assert.equal(result.recoveredExpectedCount, 1);
});

test("counts a hallucinated product once in final merged batch precision", () => {
  const result = evaluateMultiPhotoVisionBatch({
    id: "batch-fp",
    pages: [
      {
        id: "page-1",
        expected: [{ name: "Croquetas", price: 9.5 }],
        parser: [{ name: "Croquetas", price: 9.5 }],
        vision: [
          { name: "Croquetas", price: 9.5 },
          { name: "Pulpo inventado", price: 22 },
        ],
      },
      {
        id: "page-2",
        expected: [{ name: "Tartar", price: 14 }],
        parser: [{ name: "Tartar", price: 14 }],
        vision: [{ name: "Tartar", price: 14 }],
      },
    ],
  });

  assert.equal(result.falsePositiveCount, 1);
  assert.equal(result.visionPrecision, 2 / 3);
});

test("activation requires at least five complete batches, ten pages and zero false positives", () => {
  const safeRows = Array.from({ length: 5 }, (_, batchIndex) =>
    evaluateMultiPhotoVisionBatch({
      id: `safe-${batchIndex}`,
      pages: [0, 1].map((pageIndex) => ({
        id: `page-${pageIndex + 1}`,
        expected: [{ name: `Producto ${batchIndex}-${pageIndex}`, price: 10 + pageIndex }],
        parser: [],
        vision: [{ name: `Producto ${batchIndex}-${pageIndex}`, price: 10 + pageIndex }],
      })),
    }),
  );

  const safe = summarizeMultiPhotoVisionEvaluation(safeRows);
  assert.equal(safe.batchCount, 5);
  assert.equal(safe.pageCount, 10);
  assert.equal(safe.falsePositives, 0);
  assert.equal(safe.activationRecommended, true);

  const tooFewBatches = summarizeMultiPhotoVisionEvaluation(safeRows.slice(0, 4));
  assert.equal(tooFewBatches.activationRecommended, false);

  const withFalsePositive = summarizeMultiPhotoVisionEvaluation([
    ...safeRows.slice(0, 4),
    evaluateMultiPhotoVisionBatch({
      id: "unsafe",
      pages: [
        {
          id: "page-1",
          expected: [{ name: "Real", price: 10 }],
          parser: [],
          vision: [
            { name: "Real", price: 10 },
            { name: "Inventado", price: 99 },
          ],
        },
        {
          id: "page-2",
          expected: [{ name: "Real 2", price: 11 }],
          parser: [],
          vision: [{ name: "Real 2", price: 11 }],
        },
      ],
    }),
  ]);
  assert.equal(withFalsePositive.falsePositives, 1);
  assert.equal(withFalsePositive.activationRecommended, false);
});
