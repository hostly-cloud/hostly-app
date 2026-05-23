import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import type {
  PrinterStationConfig,
  PrinterStationKey,
} from "@/lib/printing/printer-config-types";
import { PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES } from "@/lib/printing/printer-config-types";

export type ResolvedPrintJobPrinterTarget = {
  printerName?: string;
  channel?: string;
  destinationLabel: string;
  hasPrinterTarget: boolean;
};

function trimOrUndefined(value?: string | null): string | undefined {
  const t = typeof value === "string" ? value.trim() : "";
  return t || undefined;
}

export function buildOperationStationMap(
  stations: readonly OperationStationDocument[],
): Map<string, OperationStationDocument> {
  return new Map(stations.map((s) => [s.id, s]));
}

export type ResolvePrintJobPrinterTargetParams = {
  legacyStation: PrinterStationKey;
  legacyStationCfg: PrinterStationConfig;
  operationStationId?: string | null;
  operationStationName?: string | null;
  operationStationsById?: ReadonlyMap<string, OperationStationDocument>;
  /** Worker: prioridad sobre estación operativa y legacy. */
  jobPrinterName?: string | null;
  jobChannel?: string | null;
  /**
   * Si true, no aplica printerChannel/printerName de estación inactiva
   * (el worker sigue usando snapshot del job y fallback legacy).
   */
  skipInactiveOperationStationPrinter?: boolean;
};

/**
 * Resuelve impresora/canal/etiqueta para un printJob.
 * Prioridad: snapshot en job → estación operativa (si aplica) → config legacy por station.
 */
export function resolvePrintJobPrinterTarget(
  params: ResolvePrintJobPrinterTargetParams,
): ResolvedPrintJobPrinterTarget {
  const legacyPrinterName = trimOrUndefined(params.legacyStationCfg.printerName);
  const legacyChannel = trimOrUndefined(params.legacyStationCfg.channel);

  const jobPrinterName = trimOrUndefined(params.jobPrinterName);
  const jobChannel = trimOrUndefined(params.jobChannel);

  const opId = trimOrUndefined(params.operationStationId ?? undefined);
  const opNameFromLine = trimOrUndefined(params.operationStationName ?? undefined);
  const opStation =
    opId && params.operationStationsById
      ? params.operationStationsById.get(opId)
      : undefined;

  const skipInactive = params.skipInactiveOperationStationPrinter === true;
  const opStationUsable =
    opStation && (!skipInactive || opStation.active !== false);

  const opPrinterName = opStationUsable
    ? trimOrUndefined(opStation.printerName)
    : undefined;
  const opChannel = opStationUsable
    ? trimOrUndefined(opStation.printerChannel)
    : undefined;

  const printerName = jobPrinterName ?? opPrinterName ?? legacyPrinterName;
  const channel = jobChannel ?? opChannel ?? legacyChannel;

  const destinationLabel =
    (opStationUsable ? trimOrUndefined(opStation.name) : undefined) ??
    opNameFromLine ??
    trimOrUndefined(params.legacyStationCfg.displayName) ??
    PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES[params.legacyStation];

  return {
    printerName,
    channel,
    destinationLabel,
    hasPrinterTarget: Boolean(printerName || channel),
  };
}
