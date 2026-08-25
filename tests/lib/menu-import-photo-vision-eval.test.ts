import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePhotoVisionCase,
  summarizePhotoVisionEvaluation,
} from "@/lib/menu-import-eval/photo-vision-eval";

test("measures recall lift when vision recovers a missed product", () => {
  const result = evaluatePhotoVisionCase({
    id: "inclined-1",
    scenario: "inclined",
    expected: [
      { name: "Ensaladilla rusa", price: 8.5 },
      { name: "Croquetas de jamón", price: 9.5 },
    ],
    parser: [{ name: "Ensaladilla rusa", price: 8.5 }],
    vision: [
      { name: "Ensaladilla rusa", price: 8.5 },
      { name: "Croquetas de jamon", price: 9.5 },
    ],
  });

  assert.equal(result.parserRecall, 0.5);
  assert.equal(result.visionRecall, 1);
  assert.equal(result.visionPrecision, 1);
  assert.equal(result.recallLift, 0.5);
  assert.equal(result.recoveredExpectedCount, 1);
});

test("counts hallucinated photo products as false positives", () => {
  const result = evaluatePhotoVisionCase({
    id: "low-light-1",
    scenario: "low_light",
    expected: [{ name: "Tartar de atún", price: 14.5 }],
    parser: [{ name: "Tartar de atún", price: 14.5 }],
    vision: [
      { name: "Tartar de atún", price: 14.5 },
      { name: "Pulpo a la brasa", price: 19 },
    ],
  });

  assert.equal(result.falsePositiveCount, 1);
  assert.equal(result.visionPrecision, 0.5);
});

test("summary never recommends activation with false positives", () => {
  const rows = [
    evaluatePhotoVisionCase({
      id: "front-1",
      scenario: "frontal",
      expected: [{ name: "Burrata", price: 12 }],
      parser: [{ name: "Burrata", price: 12 }],
      vision: [{ name: "Burrata", price: 12 }],
    }),
    evaluatePhotoVisionCase({
      id: "wine-1",
      scenario: "wine",
      expected: [{ name: "Rioja Crianza", price: 24 }],
      parser: [],
      vision: [
        { name: "Rioja Crianza", price: 24 },
        { name: "Ribera Reserva", price: 32 },
      ],
    }),
    ...Array.from({ length: 3 }, (_, index) =>
      evaluatePhotoVisionCase({
        id: `columns-${index}`,
        scenario: "columns",
        expected: [{ name: `Producto ${index}`, price: 10 + index }],
        parser: [{ name: `Producto ${index}`, price: 10 + index }],
        vision: [{ name: `Producto ${index}`, price: 10 + index }],
      }),
    ),
  ];

  const summary = summarizePhotoVisionEvaluation(rows);
  assert.equal(summary.caseCount, 5);
  assert.equal(summary.falsePositives, 1);
  assert.equal(summary.activationRecommended, false);
});
