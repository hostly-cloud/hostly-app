import type { AnalysisTabContentProps } from "@/components/analysis";

export type BuildAnalysisTabContentPropsInput = AnalysisTabContentProps;

export function buildAnalysisTabContentProps(
  input: BuildAnalysisTabContentPropsInput,
): AnalysisTabContentProps {
  return {
    ...input,
  };
}

