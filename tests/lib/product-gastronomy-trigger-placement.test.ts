import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

describe("product gastronomy trigger placement", () => {
  const source = readFileSync(
    "components/productos/product-gastronomy-management-panel.tsx",
    "utf8",
  );

  test("uses the Hostly button system and stays above the global help trigger", () => {
    assert.match(source, /<HostlyButton\s+variant="secondary"\s+size="touch"/);
    assert.match(source, /data-hostly-gastronomy-trigger/);
    assert.match(
      source,
      /bottom-\[calc\(1rem\+var\(--hostly-mobile-cta-min-h\)\+var\(--hostly-op-gap-sm\)\+env\(safe-area-inset-bottom\)\)\]/,
    );
    assert.match(source, /sm:bottom-\[calc\(1\.5rem\+var\(--hostly-mobile-cta-min-h\)\+var\(--hostly-op-gap-sm\)\+env\(safe-area-inset-bottom\)\)\]/);
    assert.doesNotMatch(source, /className="fixed bottom-5 right-5/);
  });

  test("exposes the dialog relationship to assistive technology", () => {
    assert.match(source, /aria-haspopup="dialog"/);
    assert.match(source, /aria-expanded=\{open\}/);
  });
});
