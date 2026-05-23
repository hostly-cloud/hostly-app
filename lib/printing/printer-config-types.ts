/** Estaciones operativas con impresora dedicada (alineado con KDS / `resolveKdsDestination`). */
export type PrinterStationKey = "kitchen" | "bar" | "cocktail";

export const PRINTER_STATION_KEYS: readonly PrinterStationKey[] = [
  "kitchen",
  "bar",
  "cocktail",
] as const;

export type PrinterStationConfig = {
  enabled: boolean;
  displayName: string;
  printerName?: string;
  channel?: string;
  copies?: number;
};

export type PrinterConfigDocument = {
  enabled: boolean;
  updatedAt: number;
  updatedBy?: string;
  stations: Record<PrinterStationKey, PrinterStationConfig>;
};

export const PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES: Record<
  PrinterStationKey,
  string
> = {
  kitchen: "Cocina",
  bar: "Barra",
  cocktail: "Coctelería",
};
