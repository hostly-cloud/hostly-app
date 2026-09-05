"use client";

import { useI18n } from "@/components/i18n-provider";
import { HostlyPlanIdentity } from "@/components/ui/hostly/HostlyPlanIdentity";
import type { HostlyPlan } from "@/lib/subscription/hostly-plan";
import { useHostlySubscription } from "./hostly-subscription-context";

const PLAN_LABEL_KEYS: Record<HostlyPlan, string> = {
  basic: "subscription.planBasic",
  pro: "subscription.planPro",
  ultra: "subscription.planUltra",
};

export function CurrentHostlyPlanIdentity({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const { access, state } = useHostlySubscription();

  if (state !== "ready" || !access) return null;

  const label = t(PLAN_LABEL_KEYS[access.effectivePlan]);
  return (
    <HostlyPlanIdentity
      plan={access.effectivePlan}
      label={label}
      ariaLabel={t("subscription.planIdentityAria", { plan: label })}
      compact={compact}
      className={className}
    />
  );
}
