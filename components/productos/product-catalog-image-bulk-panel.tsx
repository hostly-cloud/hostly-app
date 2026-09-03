"use client";

import { useEffect, useState } from "react";
import { resolveCatalogImageSubscriptionUiAccess } from "@/lib/productos/catalog-image-subscription-ui";
import { fetchHostlySubscriptionAccess } from "@/lib/subscription/hostly-subscription-access-api";
import { ProductCatalogImageBulkPanel as ProductCatalogImageBulkPanelContent } from "./product-catalog-image-bulk-panel-content";

export function ProductCatalogImageBulkPanel() {
  const [canGenerateBulk, setCanGenerateBulk] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchHostlySubscriptionAccess()
      .then((access) => {
        if (!active) return;
        setCanGenerateBulk(
          resolveCatalogImageSubscriptionUiAccess(access).canGenerateBulk,
        );
      })
      .catch(() => {
        if (active) setCanGenerateBulk(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!canGenerateBulk) return null;

  return <ProductCatalogImageBulkPanelContent />;
}
