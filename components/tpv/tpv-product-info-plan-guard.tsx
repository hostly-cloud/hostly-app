"use client";

import { useEffect, useState } from "react";
import { fetchHostlySubscriptionAccess } from "@/lib/subscription/hostly-subscription-access-api";
import { resolveTpvProductInfoAccess } from "@/lib/tpv/product-info-plan-access";

/**
 * Defensa UX adicional para el contrato Básico: las tarjetas TPV siguen siendo
 * clicables, pero no reciben los eventos que disparan pulsación mantenida.
 * La autoridad comercial sigue estando en el plan resuelto por servidor.
 */
export function TpvProductInfoPlanGuard() {
  const [basicClickOnly, setBasicClickOnly] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchHostlySubscriptionAccess()
      .then((access) => {
        if (cancelled) return;
        setBasicClickOnly(
          !resolveTpvProductInfoAccess(access.effectivePlan).canOpenGastronomy,
        );
      })
      .catch(() => {
        if (!cancelled) setBasicClickOnly(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!basicClickOnly) return;

    const blockHoldStart = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".carta-product-card")) return;
      event.stopPropagation();
    };

    document.addEventListener("pointerdown", blockHoldStart, true);
    document.addEventListener("mousedown", blockHoldStart, true);
    return () => {
      document.removeEventListener("pointerdown", blockHoldStart, true);
      document.removeEventListener("mousedown", blockHoldStart, true);
    };
  }, [basicClickOnly]);

  return null;
}
