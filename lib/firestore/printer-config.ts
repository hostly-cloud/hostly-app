import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import {
  PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES,
  PRINTER_STATION_KEYS,
  type PrinterConfigDocument,
  type PrinterStationConfig,
  type PrinterStationKey,
} from "@/lib/printing/printer-config-types";

export const PRINTER_CONFIG_DOC_SEGMENTS = ["config", "printers"] as const;

const MIN_COPIES = 1;
const MAX_COPIES = 5;

/** `restaurants/{restaurantId}/config/printers` */
export function printerConfigDocRef(restaurantId: string) {
  return doc(db, "restaurants", restaurantId.trim(), ...PRINTER_CONFIG_DOC_SEGMENTS);
}

function clampCopies(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.floor(value);
  if (n < MIN_COPIES) return MIN_COPIES;
  if (n > MAX_COPIES) return MAX_COPIES;
  return n;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

function normalizeStationConfig(
  key: PrinterStationKey,
  raw: unknown,
): PrinterStationConfig {
  const fallbackName = PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES[key];
  if (!raw || typeof raw !== "object") {
    return { enabled: false, displayName: fallbackName, copies: 1 };
  }
  const rec = raw as Record<string, unknown>;
  const displayName =
    readOptionalTrimmedString(rec.displayName) ?? fallbackName;
  const copies = clampCopies(rec.copies) ?? 1;
  const printerName = readOptionalTrimmedString(rec.printerName);
  const channel = readOptionalTrimmedString(rec.channel);
  return {
    enabled: rec.enabled === true,
    displayName,
    ...(printerName ? { printerName } : {}),
    ...(channel ? { channel } : {}),
    copies,
  };
}

function normalizeStationsMap(
  raw: unknown,
): Record<PrinterStationKey, PrinterStationConfig> {
  const stationsRaw =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const out = {} as Record<PrinterStationKey, PrinterStationConfig>;
  for (const key of PRINTER_STATION_KEYS) {
    out[key] = normalizeStationConfig(key, stationsRaw[key]);
  }
  return out;
}

export function getDefaultPrinterConfig(): PrinterConfigDocument {
  const now = Date.now();
  return {
    enabled: false,
    updatedAt: now,
    stations: normalizeStationsMap(null),
  };
}

export function parsePrinterConfigDocument(
  raw: unknown,
): PrinterConfigDocument {
  if (!raw || typeof raw !== "object") return getDefaultPrinterConfig();
  const data = raw as Record<string, unknown>;
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : Date.now();
  const updatedBy = readOptionalTrimmedString(data.updatedBy);
  return {
    enabled: data.enabled === true,
    updatedAt,
    ...(updatedBy ? { updatedBy } : {}),
    stations: normalizeStationsMap(data.stations),
  };
}

/** Sanitiza antes de persistir (copias 1–5, strings recortados). */
export function sanitizePrinterConfigForSave(
  input: PrinterConfigDocument,
): PrinterConfigDocument {
  const stations = {} as Record<PrinterStationKey, PrinterStationConfig>;
  for (const key of PRINTER_STATION_KEYS) {
    const s = input.stations[key];
    const displayName =
      readOptionalTrimmedString(s?.displayName) ??
      PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES[key];
    const copies = clampCopies(s?.copies) ?? 1;
    const printerName = readOptionalTrimmedString(s?.printerName);
    const channel = readOptionalTrimmedString(s?.channel);
    stations[key] = {
      enabled: s?.enabled === true,
      displayName,
      ...(printerName ? { printerName } : {}),
      ...(channel ? { channel } : {}),
      copies,
    };
  }
  return {
    enabled: input.enabled === true,
    updatedAt: Date.now(),
    stations,
  };
}

export async function getPrinterConfig(
  restaurantId: string,
): Promise<PrinterConfigDocument> {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) return getDefaultPrinterConfig();
  try {
    const snap = await getDoc(printerConfigDocRef(rid));
    if (!snap.exists()) return getDefaultPrinterConfig();
    return parsePrinterConfigDocument(snap.data());
  } catch {
    return getDefaultPrinterConfig();
  }
}

export type PrinterConfigListenMeta = {
  /** `false` si el documento aún no existe en Firestore (defaults en UI). */
  exists: boolean;
};

export function listenPrinterConfig(
  restaurantId: string,
  onData: (config: PrinterConfigDocument, meta: PrinterConfigListenMeta) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) {
    onData(getDefaultPrinterConfig(), { exists: false });
    return () => {};
  }

  return onSnapshot(
    printerConfigDocRef(rid),
    (snap) => {
      if (!snap.exists()) {
        onData(getDefaultPrinterConfig(), { exists: false });
        return;
      }
      onData(parsePrinterConfigDocument(snap.data()), { exists: true });
    },
    (error) => {
      onListenError?.(error);
    },
  );
}

export async function savePrinterConfig(
  restaurantId: string,
  config: PrinterConfigDocument,
): Promise<void> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("UNAUTHORIZED");

  const payload = sanitizePrinterConfigForSave(config);
  await setDoc(
    printerConfigDocRef(rid),
    {
      ...payload,
      updatedAt: Date.now(),
      updatedBy: uid,
    },
    { merge: false },
  );
}
