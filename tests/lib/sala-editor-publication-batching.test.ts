import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "lib/sala-editor/persistence/sala-editor-v2-publication-core.ts",
  "utf8",
);

test("la proyección decorativa se publica mediante batches Firestore", () => {
  const implementation = source.slice(
    source.indexOf("async function commitDecorativeWritesWithTrace"),
    source.indexOf("export async function publishSalaEditorV2Phase1ToLegacy"),
  );

  assert.match(implementation, /await commitUpdateWrites\(writes, params\)/);
  assert.doesNotMatch(implementation, /for \(const write of writes\)/);
  assert.doesNotMatch(implementation, /await setDoc\(/);
});
