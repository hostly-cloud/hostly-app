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
      <p className="hostly-product-menu-family-inherited-hint__title">
        {t("carta.productMenuFamilyInheritedTitle")}
      </p>
      <dl className="hostly-product-menu-family-inherited-hint__rows">
        <div className="hostly-product-menu-family-inherited-hint__row">
          <dt>{t("carta.productMenuFamilyInheritedMenuFamily")}</dt>
          <dd>{view.menuFamilyName}</dd>
        </div>
        <div className="hostly-product-menu-family-inherited-hint__row">
          <dt>{t("carta.productMenuFamilyInheritedStation")}</dt>
          <dd>{stationLabel}</dd>
        </div>
        <div className="hostly-product-menu-family-inherited-hint__row">
          <dt>{t("carta.productMenuFamilyInheritedPass")}</dt>
          <dd>{passLabel}</dd>
        </div>
      </dl>
      <p className="hostly-product-menu-family-inherited-hint__disclaimer">
        {t("carta.productMenuFamilyInheritedDisclaimer")}
      </p>
    </aside>
  );
}
