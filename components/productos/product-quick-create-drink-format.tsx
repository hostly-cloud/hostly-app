"use client";

import type { ProductCompositionType } from "@/lib/carta/product-composition-type";

/** Solo bebidas: formato heredado de la categoría (presentación). */
export function ProductQuickCreateDrinkFormat({
  compositionType,
}: {
  compositionType: ProductCompositionType;
}) {
  const isMixer = compositionType === "composed";

  return (
    <fieldset className="hostly-product-quick-create-v3__drink-format">
      <legend className="hostly-product-quick-create-v3__drink-format-label">Formato</legend>
      <div
        className="hostly-product-quick-create-v3__drink-format-options"
        role="radiogroup"
        aria-label="Formato de bebida"
      >
        <label
          className={`hostly-product-quick-create-v3__drink-option${!isMixer ? " is-selected" : ""}`}
        >
          <span className="hostly-product-quick-create-v3__drink-option-dot" aria-hidden />
          <span>Bebida normal</span>
        </label>
        <label
          className={`hostly-product-quick-create-v3__drink-option${isMixer ? " is-selected" : ""}`}
        >
          <span className="hostly-product-quick-create-v3__drink-option-dot" aria-hidden />
          <span>Mixer</span>
        </label>
      </div>
      <p className="sr-only">Formato heredado de la categoría seleccionada.</p>
    </fieldset>
  );
}
