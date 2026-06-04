"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  EscandalloMarginStatusBadge,
  HostlyCostBadge,
  HostlyMarginBadge,
} from "@/components/carta/escandallos/escandallo-badges";
import { formatMoney2 } from "@/components/carta/escandallos/escandallo-display-utils";
import {
  computeProductProfitability,
  type ProductProfitabilityDraftRow,
  type ProductProfitabilityInput,
} from "@/components/carta/escandallos/product-profitability-utils";
import type { ProductDocument } from "@/lib/firestore/products";

export type ProductProfitabilityPanelProps = {
  recipeEnabled: boolean;
  recipeRows: readonly ProductProfitabilityDraftRow[];
  saleProductId: string | null;
  salePrice: number | null;
  productDocumentsById: ReadonlyMap<string, ProductDocument>;
};

const shellStyle = {
  padding: "12px 12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(2, 6, 23, 0.45)",
} as const;

function ProfitabilityKpiStrip({
  serviceCost,
  salePrice,
  marginPct,
  estimatedServings,
  showMargin,
  labels,
}: {
  serviceCost: number;
  salePrice: number | null;
  marginPct: number | null;
  estimatedServings: number | null;
  showMargin: boolean;
  labels: {
    serviceCost: string;
    currentPrice: string;
    margin: string;
    estimatedCups: string;
  };
}) {
  return (
    <>
      <div
        className="hostly-recipe-editor__kpi-strip hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense"
        style={{ marginTop: 12 }}
      >
        <div className="hostly-carta-config-kpi-pill">
          <span className="hostly-carta-config-kpi-pill__label">{labels.serviceCost}</span>
          <span className="hostly-carta-config-kpi-pill__value">
            <HostlyCostBadge value={formatMoney2(serviceCost)} />
          </span>
        </div>
        {salePrice != null ? (
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">{labels.currentPrice}</span>
            <span className="hostly-carta-config-kpi-pill__value">
              <HostlyCostBadge value={formatMoney2(salePrice)} />
            </span>
          </div>
        ) : null}
        {showMargin && marginPct != null ? (
          <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--success">
            <span className="hostly-carta-config-kpi-pill__label">{labels.margin}</span>
            <span className="hostly-carta-config-kpi-pill__value">
              <HostlyMarginBadge
                marginPct={marginPct}
                coste={serviceCost}
                venta={salePrice}
                emphasize
              />
            </span>
          </div>
        ) : null}
        {estimatedServings != null && salePrice == null ? (
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">{labels.estimatedCups}</span>
            <span className="hostly-carta-config-kpi-pill__value">{estimatedServings}</span>
          </div>
        ) : null}
      </div>
      {estimatedServings != null && salePrice != null ? (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 }}>
          <span style={{ color: "#94a3b8" }}>{labels.estimatedCups}: </span>
          <strong style={{ color: "#f8fafc" }}>{estimatedServings}</strong>
        </p>
      ) : null}
    </>
  );
}

export function ProductProfitabilityPanel({
  recipeEnabled,
  recipeRows,
  saleProductId,
  salePrice,
  productDocumentsById,
}: ProductProfitabilityPanelProps) {
  const { t } = useI18n();

  const profitability = useMemo(
    () =>
      computeProductProfitability({
        recipeEnabled,
        recipeRows,
        saleProductId,
        salePrice,
        productDocumentsById,
      } satisfies ProductProfitabilityInput),
    [recipeEnabled, recipeRows, saleProductId, salePrice, productDocumentsById],
  );

  const labels = {
    serviceCost: t("carta.productProfitabilityServiceCost"),
    currentPrice: t("carta.productProfitabilityCurrentPrice"),
    margin: t("carta.productProfitabilityMargin"),
    estimatedCups: t("carta.productProfitabilityEstimatedCups"),
  };

  if (!profitability.hasServiceCost) {
    return (
      <div className="hostly-product-profitability" style={shellStyle}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>
          {t("carta.productProfitabilityTitle")}
        </h4>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
          {t("carta.productProfitabilityInsufficient")}
        </p>
      </div>
    );
  }

  const serviceCost = profitability.serviceCost!;

  if (!profitability.sufficient) {
    return (
      <div className="hostly-product-profitability" style={shellStyle}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>
          {t("carta.productProfitabilityTitle")}
        </h4>
        <ProfitabilityKpiStrip
          serviceCost={serviceCost}
          salePrice={profitability.salePrice}
          marginPct={profitability.marginPct}
          estimatedServings={profitability.estimatedServings}
          showMargin={false}
          labels={labels}
        />
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
          {t("carta.productProfitabilityNeedPrice")}
        </p>
      </div>
    );
  }

  return (
    <div className="hostly-product-profitability" style={shellStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>
          {t("carta.productProfitabilityTitle")}
        </h4>
        <EscandalloMarginStatusBadge tier={profitability.marginTier} />
      </div>

      <ProfitabilityKpiStrip
        serviceCost={serviceCost}
        salePrice={profitability.salePrice}
        marginPct={profitability.marginPct}
        estimatedServings={profitability.estimatedServings}
        showMargin
        labels={labels}
      />
    </div>
  );
}
