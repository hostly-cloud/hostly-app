"use client";

import type { ProductMenuFamilyInheritedHintView } from "@/lib/productos/product-menu-family-inherited-hint";

export type ProductMenuFamilyInheritedHintCardProps = {
  view: ProductMenuFamilyInheritedHintView;
  t: (key: string) => string;
};

export function ProductMenuFamilyInheritedHintCard({
  view,
  t,
}: ProductMenuFamilyInheritedHintCardProps) {
  if (view.status === "hidden") return null;

  if (view.status === "no-menu-family") {
    return (
      <p className="hostly-product-menu-family-inherited-hint__empty" role="note">
        {t("carta.productMenuFamilyInheritedNoFamily")}
      </p>
    );
  }

  const stationLabel =
    view.suggestedStation === "Sin estación sugerida"
      ? t("carta.productMenuFamilyInheritedNoStation")
      : view.suggestedStation;
  const passLabel =
    view.suggestedPass === "Sin pases"
      ? t("carta.productMenuFamilyInheritedNoPass")
      : view.suggestedPass;

  return (
    <aside
      className="hostly-product-menu-family-inherited-hint"
      aria-label={t("carta.productMenuFamilyInheritedTitle")}
    >
      <p className="hostly-product-menu-family-inherited-hint__eyebrow">
        {t("carta.productMenuFamilyInheritedTitle")}
      </p>

      <div className="hostly-product-menu-family-inherited-hint__flow">
        <div className="hostly-product-menu-family-inherited-hint__step">
          <span className="hostly-product-menu-family-inherited-hint__step-label">
            {t("carta.productMenuFamilyInheritedMenuFamily")}
          </span>
          <span className="hostly-product-menu-family-inherited-hint__step-value">
            {view.menuFamilyName}
          </span>
        </div>

        <div
          className="hostly-product-menu-family-inherited-hint__arrow"
          aria-hidden="true"
        >
          ↓
        </div>

        <div className="hostly-product-menu-family-inherited-hint__step">
          <span className="hostly-product-menu-family-inherited-hint__step-label">
            {t("carta.productMenuFamilyInheritedCategory")}
          </span>
          <span className="hostly-product-menu-family-inherited-hint__step-value">
            {view.categoryName}
          </span>
        </div>

        <div
          className="hostly-product-menu-family-inherited-hint__arrow"
          aria-hidden="true"
        >
          ↓
        </div>

        <div className="hostly-product-menu-family-inherited-hint__outcome">
          <p className="hostly-product-menu-family-inherited-hint__outcome-line">
            <span className="hostly-product-menu-family-inherited-hint__outcome-label">
              {t("carta.productMenuFamilyInheritedStation")}
            </span>
            <span className="hostly-product-menu-family-inherited-hint__outcome-value">
              {stationLabel}
            </span>
          </p>
          <p className="hostly-product-menu-family-inherited-hint__outcome-line">
            <span className="hostly-product-menu-family-inherited-hint__outcome-label">
              {t("carta.productMenuFamilyInheritedPass")}
            </span>
            <span className="hostly-product-menu-family-inherited-hint__outcome-value">
              {passLabel}
            </span>
          </p>
        </div>
      </div>

      <p className="hostly-product-menu-family-inherited-hint__disclaimer">
        {t("carta.productMenuFamilyInheritedDisclaimer")}
      </p>
    </aside>
  );
}
