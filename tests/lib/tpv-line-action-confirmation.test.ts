import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const source = readFileSync(
  new URL(
    "../../app/dashboard/carta/carta-page-content.tsx",
    import.meta.url,
  ),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `No se encontró el inicio: ${start}`);
  assert.notEqual(endIndex, -1, `No se encontró el final: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe("TPV line action confirmation", () => {
  test("remove, comp and cancel handlers do not invoke native confirms", () => {
    const cancelHandler = sourceBetween(
      "const handleCancelSentOrderLine",
      "const handleRemoveOneUnitFromLine",
    );
    const removeHandler = sourceBetween(
      "const handleRemoveOneUnitFromLine",
      "const handleCompProductFromLine",
    );
    const compHandler = sourceBetween(
      "const handleCompProductFromLine",
      "const requestLineActionConfirmation",
    );

    for (const handler of [cancelHandler, removeHandler, compHandler]) {
      assert.doesNotMatch(handler, /window\.confirm\s*\(/);
    }
  });

  test("all sent-line entry points request the in-app confirmation", () => {
    assert.match(
      source,
      /requestLineActionConfirmation\(\s*"remove-one",\s*comandaLineActionsTarget/,
    );
    assert.match(
      source,
      /requestLineActionConfirmation\(\s*"comp",\s*comandaLineActionsTarget/,
    );
    assert.match(
      source,
      /requestLineActionConfirmation\("cancel",[\s\S]*?line\)/,
    );
    assert.match(
      source,
      /requestLineActionConfirmation\(\s*"cancel",\s*comandaLineActionsTarget/,
    );
  });

  test("renders an accessible, non-native confirmation with busy state", () => {
    assert.match(source, /role="alertdialog"/);
    assert.match(source, /aria-labelledby="carta-line-action-confirm-title"/);
    assert.match(
      source,
      /aria-describedby="carta-line-action-confirm-description"/,
    );
    assert.match(source, /lineActionConfirmationBusy/);
    assert.match(source, /"Quitar unidad"/);
    assert.match(source, /"Confirmar invitación"/);
    assert.match(source, /"Anular línea"/);
  });

  test("warns inside the dialog when connectivity is unstable", () => {
    assert.match(
      source,
      /La conexión no es estable; confirma solo si quieres continuar igualmente\./,
    );
  });
});
