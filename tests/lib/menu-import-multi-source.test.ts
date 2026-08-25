import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MENU_IMPORT_SOURCE_FILES,
  readMenuImportSourceFiles,
  resolveMenuImportSourceFiles,
} from "@/lib/carta/menu-import-source-files";

const files = [
  {
    storagePath: "restaurants/r1/menu-imports/d1/pages/002-b.jpg",
    originalFileName: "b.jpg",
    sourceType: "image" as const,
    order: 1,
  },
  {
    storagePath: "restaurants/r1/menu-imports/d1/pages/001-a.jpg",
    originalFileName: "a.jpg",
    sourceType: "image" as const,
    order: 0,
  },
];

test("sourceFiles are normalized and ordered", () => {
  assert.deepEqual(readMenuImportSourceFiles(files), [files[1], files[0]]);
});

test("legacy single file remains supported", () => {
  assert.deepEqual(
    resolveMenuImportSourceFiles({
      sourceType: "image",
      storagePath: "restaurants/r1/menu-imports/d1/a.jpg",
      originalFileName: "a.jpg",
    }),
    [
      {
        storagePath: "restaurants/r1/menu-imports/d1/a.jpg",
        originalFileName: "a.jpg",
        sourceType: "image",
        order: 0,
      },
    ],
  );
});

test("source file count is capped", () => {
  const many = Array.from({ length: MAX_MENU_IMPORT_SOURCE_FILES + 5 }, (_, index) => ({
    storagePath: `restaurants/r1/menu-imports/d1/pages/${index}.jpg`,
    originalFileName: `${index}.jpg`,
    sourceType: "image",
    order: index,
  }));
  assert.equal(readMenuImportSourceFiles(many).length, MAX_MENU_IMPORT_SOURCE_FILES);
});
