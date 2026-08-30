import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Product image form contract", () => {
  const managementSource = readFileSync(
    "components/productos/productos-management-page.tsx",
    "utf8",
  );
  const modalSource = readFileSync(
    "components/productos/product-form-commercial-info-modal.tsx",
    "utf8",
  );
  const spanishLocale = readFileSync("locales/es.ts", "utf8");

  it("passes the edited product id to identity and image review flows", () => {
    const modalStart = managementSource.lastIndexOf(
      "<ProductFormCommercialInfoModal",
    );
    const modalEnd = managementSource.indexOf("/>", modalStart);
    const modalCall = managementSource.slice(modalStart, modalEnd);

    assert.ok(modalStart >= 0 && modalEnd > modalStart);
    assert.match(modalCall, /productId=\{editingId\}/);
  });

  it("explains that a selected manual image is uploaded on product save", () => {
    assert.match(modalSource, /imageDraftMode === "manual_pending"/);
    assert.match(modalSource, /carta\.fieldFotoPending/);
    assert.match(spanishLocale, /fieldFotoUpload: "Seleccionar imagen"/);
    assert.match(spanishLocale, /fieldFotoChange: "Elegir otra imagen"/);
    assert.match(spanishLocale, /pulsa Guardar para subirla/);
    assert.match(modalSource, /doneLabel = "Volver a la ficha"/);
  });
});
