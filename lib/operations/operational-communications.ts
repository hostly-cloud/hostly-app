import { normalizeHostlyRole } from "@/lib/auth/hostly-capabilities";
import type { OperationalNotificationChannel, OperationalNotificationStage } from "@/lib/operations/operational-notifications";

export type OperationalCommunicationAudience = "managers" | "supervisors";

export type OperationalCommunicationStageRule = {
  audience: OperationalCommunicationAudience;
  push: boolean;
  email: boolean;
};

export type OperationalCommunicationPolicy = {
  enabled: boolean;
  attention: OperationalCommunicationStageRule;
  critical: OperationalCommunicationStageRule;
  escalated: OperationalCommunicationStageRule;
};

export const DEFAULT_OPERATIONAL_COMMUNICATION_POLICY: OperationalCommunicationPolicy = {
  enabled: true,
  attention: {
    audience: "supervisors",
    push: true,
    email: false,
  },
  critical: {
    audience: "supervisors",
    push: true,
    email: true,
  },
  escalated: {
    audience: "managers",
    push: true,
    email: true,
  },
};

function sanitizeAudience(
  value: unknown,
  fallback: OperationalCommunicationAudience,
): OperationalCommunicationAudience {
  return value === "managers" || value === "supervisors" ? value : fallback;
}

function sanitizeRule(
  value: unknown,
  fallback: OperationalCommunicationStageRule,
): OperationalCommunicationStageRule {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    audience: sanitizeAudience(raw.audience, fallback.audience),
    push: raw.push == null ? fallback.push : raw.push === true,
    email: raw.email == null ? fallback.email : raw.email === true,
  };
}

export function sanitizeOperationalCommunicationPolicy(value: unknown): OperationalCommunicationPolicy {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    enabled: raw.enabled !== false,
    attention: sanitizeRule(raw.attention, DEFAULT_OPERATIONAL_COMMUNICATION_POLICY.attention),
    critical: sanitizeRule(raw.critical, DEFAULT_OPERATIONAL_COMMUNICATION_POLICY.critical),
    escalated: sanitizeRule(raw.escalated, DEFAULT_OPERATIONAL_COMMUNICATION_POLICY.escalated),
  };
}

export function operationalCommunicationRuleForStage(
  policy: OperationalCommunicationPolicy,
  stage: OperationalNotificationStage,
): OperationalCommunicationStageRule {
  return policy[stage];
}

export function recipientMatchesOperationalCommunicationAudience(
  role: string,
  audience: OperationalCommunicationAudience,
): boolean {
  if (audience === "supervisors") return true;
  const normalized = normalizeHostlyRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "manager";
}

export function operationalCommunicationChannelEnabled(input: {
  policy: OperationalCommunicationPolicy;
  stage: OperationalNotificationStage;
  channel: OperationalNotificationChannel;
  globalChannelEnabled: boolean;
  providerAvailable: boolean;
}): boolean {
  if (!input.policy.enabled || !input.globalChannelEnabled || !input.providerAvailable) return false;
  const rule = operationalCommunicationRuleForStage(input.policy, input.stage);
  return rule[input.channel];
}
