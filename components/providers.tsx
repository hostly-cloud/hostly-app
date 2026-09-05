"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-context";
import { I18nProvider } from "@/components/i18n-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <I18nProvider>{children}</I18nProvider>
    </AuthProvider>
  );
}
