export type ProcessPrintJobItemOutcome =
  | "printed"
  | "failed"
  | "omitted"
  | "dry_run_print"
  | "dry_run_fail"
  | "skipped"
  | "error";

export type ProcessPrintJobItemResult = {
  jobId: string;
  outcome: ProcessPrintJobItemOutcome;
  reason?: string;
  copies?: number;
  productName?: string;
  modifiersLabel?: string;
};

export type ProcessPendingPrintJobsResult = {
  dryRun: boolean;
  processed: number;
  printed: number;
  failed: number;
  omitted: number;
  skipped: number;
  errors: number;
  simulatedPrint: number;
  simulatedFail: number;
  items: ProcessPrintJobItemResult[];
};
