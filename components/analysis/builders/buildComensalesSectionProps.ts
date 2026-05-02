import type { ComensalesAnalyticsSectionProps } from "@/components/analysis";

export type BuildComensalesSectionPropsInput = ComensalesAnalyticsSectionProps;

export function buildComensalesSectionProps(
  input: BuildComensalesSectionPropsInput,
): ComensalesAnalyticsSectionProps {
  return {
    ...input,
  };
}

