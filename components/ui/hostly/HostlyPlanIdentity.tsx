import type { HostlyPlan } from "@/lib/subscription/hostly-plan";
import { hostlyCx } from "./hostly-cx";

export type HostlyPlanIdentityProps = {
  plan: HostlyPlan;
  label?: string;
  ariaLabel?: string;
  compact?: boolean;
  className?: string;
};

function PlanEmblem({ plan }: { plan: HostlyPlan }) {
  return (
    <span className="hostly-plan-identity__emblem" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none">
        {plan === "basic" ? (
          <>
            <rect x="5.5" y="5.5" width="13" height="13" rx="4" />
            <path d="M9 9v6M15 9v6M9 12h6" />
          </>
        ) : plan === "pro" ? (
          <>
            <path d="M12 3.5 18.5 7v5.2c0 3.8-2.5 6.7-6.5 8.3-4-1.6-6.5-4.5-6.5-8.3V7L12 3.5Z" />
            <path d="m8.8 12.1 2.1 2.1 4.4-5" />
          </>
        ) : (
          <>
            <path d="m12 2.8 1.7 5.5 5.5 1.7-5.5 1.7-1.7 5.5-1.7-5.5L4.8 10l5.5-1.7L12 2.8Z" />
            <path d="m18.5 15.2.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
          </>
        )}
      </svg>
    </span>
  );
}

/** Distintivo de marca del plan activo. No concede capacidades: solo las representa. */
export function HostlyPlanIdentity({
  plan,
  label,
  ariaLabel,
  compact = false,
  className,
}: HostlyPlanIdentityProps) {
  const resolvedLabel = label ?? (plan === "basic" ? "Básico" : plan === "pro" ? "Pro" : "Ultra");

  return (
    <span
      className={hostlyCx(
        "hostly-plan-identity",
        compact && "hostly-plan-identity--compact",
        className,
      )}
      data-plan={plan}
      aria-label={ariaLabel ?? `Hostly ${resolvedLabel}`}
      title={`Hostly ${resolvedLabel}`}
    >
      <PlanEmblem plan={plan} />
      <span className="hostly-plan-identity__copy" aria-hidden>
        <span className="hostly-plan-identity__brand">Hostly</span>
        <span className="hostly-plan-identity__name">{resolvedLabel}</span>
      </span>
    </span>
  );
}
