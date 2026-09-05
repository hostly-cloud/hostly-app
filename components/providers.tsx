"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-context";
import { I18nProvider } from "@/components/i18n-provider";
import { TpvProductInfoPlanGuard } from "@/components/tpv/tpv-product-info-plan-guard";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <I18nProvider>
        <TpvProductInfoPlanGuard />
        {children}
      </I18nProvider>
    </AuthProvider>
  );
}
