"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import OnboardingApp from "@/components/onboarding/onboarding-app";
import ModulePageShell from "@/components/module-page-shell";

export default function OnboardingPage() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <ModulePageShell
      title={t("onboarding.title")}
      subtitle={t("onboarding.subtitle")}
      maxWidth={1240}
      compactLayout
      operationalFocus
      lockViewport
      backHref="/dashboard"
      backLabel={t("onboarding.shellBack")}
      headerRight={
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          style={{
            border: "1px solid rgba(71, 85, 105, 0.55)",
            background: "transparent",
            color: "#64748b",
            padding: "7px 12px",
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {t("onboarding.exitLater")}
        </button>
      }
    >
      <OnboardingApp />
    </ModulePageShell>
  );
}
