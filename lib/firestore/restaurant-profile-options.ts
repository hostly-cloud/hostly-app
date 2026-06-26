import { TIPOS_NEGOCIO } from "@/lib/hostly/restaurant-profile";

const RESTAURANT_BUSINESS_TYPE_LABELS: Record<(typeof TIPOS_NEGOCIO)[number], string> = {
  restaurante: "Restaurante",
  bar: "Bar",
  cafeteria: "Cafetería",
  pizzeria: "Pizzería",
  gastrobar: "Gastrobar",
  otro: "Otro",
};

export const RESTAURANT_BUSINESS_TYPE_OPTIONS = TIPOS_NEGOCIO.map((value) => ({
  value,
  label: RESTAURANT_BUSINESS_TYPE_LABELS[value],
}));

export const RESTAURANT_TIMEZONE_OPTIONS = [
  { value: "Europe/Madrid", label: "Europa · Madrid (CET/CEST)" },
  { value: "Atlantic/Canary", label: "Europa · Canarias (WET/WEST)" },
  { value: "Europe/Lisbon", label: "Europa · Lisboa (WET/WEST)" },
  { value: "Europe/London", label: "Europa · Londres (GMT/BST)" },
  { value: "America/Mexico_City", label: "América · Ciudad de México" },
  { value: "America/Bogota", label: "América · Bogotá" },
  { value: "America/Argentina/Buenos_Aires", label: "América · Buenos Aires" },
] as const;

export const RESTAURANT_CURRENCY_OPTIONS = [
  { value: "EUR", label: "Euro (EUR)" },
  { value: "USD", label: "Dólar estadounidense (USD)" },
  { value: "GBP", label: "Libra esterlina (GBP)" },
  { value: "MXN", label: "Peso mexicano (MXN)" },
  { value: "COP", label: "Peso colombiano (COP)" },
  { value: "ARS", label: "Peso argentino (ARS)" },
] as const;

export type SelectOption = { value: string; label: string };

/** Incluye el valor actual si no está en la lista predefinida (docs legacy o custom). */
export function timezoneSelectOptions(currentValue: string): SelectOption[] {
  const trimmed = currentValue.trim();
  const base: SelectOption[] = RESTAURANT_TIMEZONE_OPTIONS.map((o) => ({ ...o }));
  if (trimmed && !base.some((o) => o.value === trimmed)) {
    base.unshift({ value: trimmed, label: trimmed });
  }
  return base;
}

export function currencySelectOptions(currentValue: string): SelectOption[] {
  const trimmed = currentValue.trim();
  const base: SelectOption[] = RESTAURANT_CURRENCY_OPTIONS.map((o) => ({ ...o }));
  if (trimmed && !base.some((o) => o.value === trimmed)) {
    base.unshift({ value: trimmed, label: trimmed });
  }
  return base;
}
