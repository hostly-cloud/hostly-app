"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import OnboardingApp from "@/components/onboarding/onboarding-app";
import ModulePageShell from "@/components/module-page-shell";
import { HostlySection, HostlySurface } from "@/components/ui/hostly";

export default function OnboardingPage() {
  const { t } = useI18n();
  const router = useRouter();

  const headerBelow = (
    <HostlySurface variant="soft" className="box-border w-full max-w-full rounded-[14px] border border-[var(--hostly-table-divider-soft)] px-4 py-3 shadow-[var(--hostly-shadow-hairline)] sm:px-5 sm:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <p className="m-0 max-w-2xl text-sm font-medium leading-snug text-[color:var(--hostly-ink-muted)]">
          {t("dashboard.onboardingPromoBody")}
        </p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 sm:max-w-[min(100%,280px)] sm:shrink-0">
          {[t("onboarding.chkCatalogo"), t("onboarding.chkInventario"), t("onboarding.chkUsuarios")].map((label) => (
            <li
              key={label}
              className="flex items-start gap-2.5 text-xs font-semibold leading-snug text-[color:var(--hostly-ink-soft)]"
            >
              <span
                className="mt-[0.35em] inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--hostly-accent)]"
                aria-hidden
              />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </HostlySurface>
  );

  return (
    <ModulePageShell
      title={t("onboarding.title")}
      subtitle={t("onboarding.subtitle")}
      maxWidth={1240}
      compactLayout
      operationalFocus
      lockViewport
      shellSurface="configLight"
      backHref="/dashboard"
      backLabel={t("onboarding.shellBack")}
      headerBelow={headerBelow}
      headerRight={
        <button type="button" onClick={() => router.push("/dashboard")} className="hostly-button-secondary shrink-0 whitespace-nowrap">
          {t("onboarding.exitLater")}
        </button>
      }
    >
      <HostlySection stack="sm" className="flex min-h-0 flex-1 flex-col overflow-hidden pt-1">
        <OnboardingApp />
      </HostlySection>
    </ModulePageShell>
  );
}
