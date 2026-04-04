"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@/components/i18n-provider";

export function Providers({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}
