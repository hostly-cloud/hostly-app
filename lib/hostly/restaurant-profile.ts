/**
 * Perfil operativo del restaurante (onboarding / futura ficha de negocio).
 */

export const RESTAURANT_PROFILE_STORAGE_KEY = "hostly.restaurant.profile.v1";

export const TIPOS_NEGOCIO = [
  "restaurante",
  "bar",
  "cafeteria",
  "pizzeria",
  "gastrobar",
  "otro",
] as const;
export type TipoNegocio = (typeof TIPOS_NEGOCIO)[number];

export const MODELOS_VENTA = ["carta_fija", "menu_dia", "ambos"] as const;
export type ModeloVenta = (typeof MODELOS_VENTA)[number];

export type RestaurantProfile = {
  nombre: string;
  tipoNegocio: TipoNegocio;
  empleadosAprox: number;
  tieneCocina: boolean;
  tieneBarra: boolean;
  modeloVenta: ModeloVenta;
};

const DEFAULT: RestaurantProfile = {
  nombre: "",
  tipoNegocio: "restaurante",
  empleadosAprox: 5,
  tieneCocina: true,
  tieneBarra: true,
  modeloVenta: "ambos",
};

export function loadRestaurantProfile(): RestaurantProfile {
  if (typeof window === "undefined") return { ...DEFAULT };
  try {
    const raw = localStorage.getItem(RESTAURANT_PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const p = JSON.parse(raw) as Partial<RestaurantProfile>;
    return {
      nombre: typeof p.nombre === "string" ? p.nombre : "",
      tipoNegocio: TIPOS_NEGOCIO.includes(p.tipoNegocio as TipoNegocio) ? (p.tipoNegocio as TipoNegocio) : "restaurante",
      empleadosAprox:
        typeof p.empleadosAprox === "number" && Number.isFinite(p.empleadosAprox) && p.empleadosAprox >= 0
          ? Math.round(p.empleadosAprox)
          : 5,
      tieneCocina: p.tieneCocina !== false,
      tieneBarra: p.tieneBarra !== false,
      modeloVenta: MODELOS_VENTA.includes(p.modeloVenta as ModeloVenta) ? (p.modeloVenta as ModeloVenta) : "ambos",
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveRestaurantProfile(p: RestaurantProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RESTAURANT_PROFILE_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* noop */
  }
}
