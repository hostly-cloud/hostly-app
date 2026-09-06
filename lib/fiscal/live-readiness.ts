import type { FiscalConfiguration } from "@/lib/fiscal/model";
import { fiscalReadiness } from "@/lib/fiscal/configuration";
import {
  HOSTLY_FISCAL_LIVE_NOT_BEFORE_ISO,
  HOSTLY_FISCAL_LIVE_NOT_BEFORE_MS,
} from "@/lib/fiscal/live-activation-policy";

export type FiscalLiveReadiness = {
  ready: boolean;
  notBefore: string;
  dateGateOpen: boolean;
  activationFlagEnabled: boolean;
  submissionFlagEnabled: boolean;
  productionEnvironmentSelected: boolean;
  missingConfiguration: string[];
  blockers: string[];
};

export function fiscalLiveReadiness(
  config: FiscalConfiguration,
  options: {
    nowMs?: number;
    activationFlagEnabled?: boolean;
    submissionFlagEnabled?: boolean;
  } = {},
): FiscalLiveReadiness {
  const nowMs = options.nowMs ?? Date.now();
  const dateGateOpen = Number.isFinite(nowMs) && nowMs >= HOSTLY_FISCAL_LIVE_NOT_BEFORE_MS;
  const activationFlagEnabled = options.activationFlagEnabled
    ?? process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED === "true";
  const submissionFlagEnabled = options.submissionFlagEnabled
    ?? process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED === "true";
  const productionEnvironmentSelected = config.aeatEnvironment === "production";
  const missingConfiguration = fiscalReadiness(config)
    .filter((check) => !check.ready)
    .map((check) => check.key);
  const blockers: string[] = [];
  if (missingConfiguration.length) blockers.push("configuration");
  if (!dateGateOpen) blockers.push("date");
  if (!activationFlagEnabled) blockers.push("activation_flag");
  if (!submissionFlagEnabled) blockers.push("submission_flag");
  if (!productionEnvironmentSelected) blockers.push("aeat_environment");

  return {
    ready: blockers.length === 0,
    notBefore: HOSTLY_FISCAL_LIVE_NOT_BEFORE_ISO,
    dateGateOpen,
    activationFlagEnabled,
    submissionFlagEnabled,
    productionEnvironmentSelected,
    missingConfiguration,
    blockers,
  };
}
