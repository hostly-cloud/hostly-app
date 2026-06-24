import { Timestamp } from "firebase/firestore";

/** Documento raíz `restaurants/{restaurantId}` — perfil operativo del negocio. */
export type RestaurantDocument = {
  id: string;
  name: string;
  businessType: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  currency: string;
  onboardingCompleted: boolean;
  createdAt: number;
  updatedAt: number;
};

/** Campos de perfil editables (excluye metadatos de documento). */
export type RestaurantProfileFields = Omit<
  RestaurantDocument,
  "id" | "createdAt" | "updatedAt"
>;

export type RestaurantProfilePatch = Partial<RestaurantProfileFields>;

export const DEFAULT_RESTAURANT_TIMEZONE = "Europe/Madrid";
export const DEFAULT_RESTAURANT_CURRENCY = "EUR";

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readMillis(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Timestamp) return value.toMillis();
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: () => number }).toMillis === "function"
  ) {
    const ms = (value as { toMillis: () => number }).toMillis();
    if (Number.isFinite(ms)) return ms;
  }
  return fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Normaliza un snapshot Firestore a perfil completo.
 * Restaurantes legacy (solo `name` + `createdAt`) reciben defaults seguros en el resto de campos.
 */
export function parseRestaurantDocument(
  restaurantId: string,
  raw: unknown,
): RestaurantDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const now = Date.now();
  const createdAt = readMillis(data.createdAt, now);
  const updatedAt = readMillis(data.updatedAt, createdAt);

  return {
    id: restaurantId.trim(),
    name: readTrimmedString(data.name),
    businessType: readTrimmedString(data.businessType),
    phone: readTrimmedString(data.phone),
    email: readTrimmedString(data.email),
    website: readTrimmedString(data.website),
    taxId: readTrimmedString(data.taxId),
    address: readTrimmedString(data.address),
    city: readTrimmedString(data.city),
    country: readTrimmedString(data.country),
    timezone: readTrimmedString(data.timezone) || DEFAULT_RESTAURANT_TIMEZONE,
    currency: readTrimmedString(data.currency) || DEFAULT_RESTAURANT_CURRENCY,
    onboardingCompleted: readBoolean(data.onboardingCompleted, false),
    createdAt,
    updatedAt,
  };
}

/** Valores por defecto para un restaurante nuevo o parcialmente configurado. */
export function emptyRestaurantDocument(restaurantId: string): RestaurantDocument {
  const now = Date.now();
  return {
    id: restaurantId.trim(),
    name: "",
    businessType: "",
    phone: "",
    email: "",
    website: "",
    taxId: "",
    address: "",
    city: "",
    country: "",
    timezone: DEFAULT_RESTAURANT_TIMEZONE,
    currency: DEFAULT_RESTAURANT_CURRENCY,
    onboardingCompleted: false,
    createdAt: now,
    updatedAt: now,
  };
}

const PATCH_STRING_KEYS = [
  "name",
  "businessType",
  "phone",
  "email",
  "website",
  "taxId",
  "address",
  "city",
  "country",
  "timezone",
  "currency",
] as const satisfies readonly (keyof RestaurantProfilePatch)[];

/** Convierte un patch parcial a payload Firestore (solo claves presentes). */
export function restaurantProfilePatchToFirestore(
  patch: RestaurantProfilePatch,
): Record<string, string | boolean | number> {
  const out: Record<string, string | boolean | number> = {};

  for (const key of PATCH_STRING_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (typeof value !== "string") continue;
    out[key] = value.trim();
  }

  if ("onboardingCompleted" in patch && typeof patch.onboardingCompleted === "boolean") {
    out.onboardingCompleted = patch.onboardingCompleted;
  }

  return out;
}
