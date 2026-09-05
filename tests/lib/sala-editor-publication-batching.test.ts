import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "lib/sala-editor/persistence/sala-editor-v2-publication-core.ts",
  "utf8",
);
const publicationSource = readFileSync(
  "lib/sala-editor/persistence/sala-editor-v2-publication.ts",
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

test("la retirada decorativa viaja al endpoint Admin y no se escribe desde el cliente", () => {
  assert.match(
    source,
    /commitUpdateWrites\(legacyTableDeactivateWrites, \{ restaurantId \}\)/,
  );
  assert.doesNotMatch(
    source,
    /commitUpdateWrites\(\s*\[\.\.\.decorativeDeactivateWrites/,
  );
  assert.match(
    publicationSource,
    /decorativeDeactivationIds: result\.decorativeAudit/,
  );
  assert.match(
    publicationSource,
    /decorativeLegacyDeactivated: publishedSnapshot\.deactivatedDecoratives/,
  );
});
