"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardGate } from "@/components/auth/dashboard-gate";
import { ActiveSessionTracker } from "@/components/session/active-session-tracker";
import { ConnectivityProvider } from "@/components/system/connectivity-context";
import { ConnectivityBanner } from "@/components/system/connectivity-banner";
import { useAuth } from "@/components/auth/auth-context";
import { useI18n } from "@/components/i18n-provider";
import {
  HostlySection,
  HostlySectionHeader,
  HostlySurface,
} from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { HostlyHelpAssistant } from "@/components/assistant/hostly-help-assistant";
import { HostlySubscriptionProvider } from "@/components/subscription/hostly-subscription-context";
import { OperationalPushForegroundListener } from "@/components/operations/operational-push-foreground-listener";
import "./dashboard-mobile-overrides.css";
import "./mobile-horizontal-hardening.css";
import "./dashboard-visual-overrides-v2.css";
import "./dashboard-viewport-fit.css";
import "./dashboard-viewport-fit-secondary.css";
import "./analysis-modern.css";
import "./catalog-workbench-v4.css";
import "./printer-control-center-v4.css";
import "./integrations-hub-v4.css";
import "./primary-action-language.css";

/**
 * Todo el área /dashboard sigue reglas TPV táctil (data-hostly-touch → globals.css).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { restaurantId, profileReady } = useAuth();
  const { t } = useI18n();

  return (
    <div
      className="hostly-touch-root flex min-h-full flex-col"
      data-hostly-touch
    >
      <Suspense fallback={null}>
        <DashboardGate>
          <ConnectivityProvider>
            <ConnectivityBanner />
            <ActiveSessionTracker />
            {isFirebaseConfigured && profileReady && !restaurantId ? (
              <HostlySection
                stack="lg"
                className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6"
              >
                <HostlySurface
                  variant="ice"
                  className="box-border w-full max-w-[560px] overflow-hidden rounded-[16px] border border-[var(--hostly-table-divider-soft)] p-6 shadow-[var(--hostly-shadow-card)] sm:p-8"
                >
                  <HostlySectionHeader
                    title={t("dashboard.onboardingPromoTitle")}
                    description={t("invites.errorNoRestaurant")}
                    titleVariant="heading"
                    className="mb-6 flex-col gap-1 sm:flex-row sm:items-end"
                    descriptionClassName="!mt-1 !max-w-none !text-[15px] !font-medium !leading-snug text-[color:var(--hostly-ink-muted)]"
                  />
                  <ul className="m-0 mb-8 flex list-none flex-col gap-2.5 border-t border-[var(--hostly-table-divider-faint)] pt-6 p-0">
                    {[
                      t("onboarding.chkCatalogo"),
                      t("onboarding.chkInventario"),
                      t("onboarding.chkUsuarios"),
                    ].map((label) => (
                      <li
                        key={label}
                        className="flex items-start gap-3 text-[13px] font-semibold text-[color:var(--hostly-ink)]"
                      >
                        <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--hostly-accent-soft)_88%,transparent)] text-[11px] font-bold text-[color:var(--hostly-navy-deep)]">
                          ✓
                        </span>
                        {label}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <Link
                      href="/dashboard/onboarding"
                      className="hostly-button-primary inline-flex shrink-0 justify-center text-center no-underline"
                    >
                      {t("dashboard.onboardingPromoCta")}
                    </Link>
                    <span className="text-center text-xs font-medium leading-snug text-[color:var(--hostly-ink-faint)] sm:text-left">
                      {t("dashboard.onboardingPromoBody")}
                    </span>
                  </div>
                </HostlySurface>
              </HostlySection>
            ) : (
              <HostlySubscriptionProvider>
                <OperationalPushForegroundListener />
                {children}
                <HostlyHelpAssistant />
              </HostlySubscriptionProvider>
            )}
          </ConnectivityProvider>
        </DashboardGate>
      </Suspense>
    </div>
  );
}
