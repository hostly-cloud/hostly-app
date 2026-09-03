"use client";

import { useEffect, useState } from "react";
import { HostlyButton } from "@/components/ui/hostly";
import { resolveCatalogImageSubscriptionUiAccess } from "@/lib/productos/catalog-image-subscription-ui";
import {
  hostlyPlanLabel,
  type HostlyPlan,
} from "@/lib/subscription/hostly-plan";
import { fetchHostlySubscriptionAccess } from "@/lib/subscription/hostly-subscription-access-api";
import { ProductCatalogImageBulkPanel as ProductCatalogImageBulkPanelContent } from "./product-catalog-image-bulk-panel-content";

export function ProductCatalogImageBulkPanel() {
  const [plan, setPlan] = useState<HostlyPlan | null>(null);
  const [canGenerateBulk, setCanGenerateBulk] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchHostlySubscriptionAccess()
      .then((access) => {
        if (!active) return;
        setPlan(access.effectivePlan);
        setCanGenerateBulk(
          resolveCatalogImageSubscriptionUiAccess(access).canGenerateBulk,
        );
      })
      .catch(() => {
        if (!active) return;
        setPlan(null);
        setCanGenerateBulk(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (canGenerateBulk) {
    return <ProductCatalogImageBulkPanelContent />;
  }

  if (!plan) return null;

  return (
    <HostlyButton
      type="button"
      variant="tool"
      size="compact"
      disabled
      title={`Plan ${hostlyPlanLabel(plan)} · Completar imágenes en lote está disponible en Ultra`}
      aria-label={`Completar imágenes en lote. Disponible en Ultra; plan actual ${hostlyPlanLabel(plan)}`}
    >
      Completar imágenes
      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 750, letterSpacing: "0.04em" }}>
        Ultra
      </span>
    </HostlyButton>
  );
}
