"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-context";
import { I18nProvider } from "@/components/i18n-provider";
import { AppCheckFetchInstaller } from "@/components/security/app-check-fetch-installer";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppCheckFetchInstaller />
      <I18nProvider>{children}</I18nProvider>
    </AuthProvider>
  );
}
