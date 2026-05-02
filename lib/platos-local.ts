/**
 * Catálogo de venta al cliente (no inventario / materias primas).
 * Persistencia local multi-tenant hasta sustituir por tabla remota (`productos_venta` + auth).
 */

export const PLATOS_LOCAL_STORAGE_KEY = "hostly.platos.v1";
export const PLATOS_CHANGED_EVENT = "hostly-platos-changed";

/** Tipo principal de producto de venta (canónico en persistencia: `tipoVenta`). */
export const TIPOS_PRODUCTO_VENTA = ["plato", "bebida"] as const;
export type TipoProductoVenta = (typeof TIPOS_PRODUCTO_VENTA)[number];

const NORM_TEXT = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function isTipoProductoVenta(v: unknown): v is TipoProductoVenta {
  return v === "plato" || v === "bebida";
}

/**
 * Normaliza a `plato` | `bebida`. Acepta valores legacy (`cafe`, `postre`, `coctel`, `menu`, `otro`) y mayúsculas/acentos.
 */
export function parseTipoVentaLoose(raw: unknown): TipoProductoVenta | null {
  if (raw == null) return null;
  const t = typeof raw === "string" ? NORM_TEXT(raw.trim()) : raw;
  if (typeof t !== "string") return isTipoProductoVenta(t) ? t : null;
  if (t === "bebida" || t === "cafe" || t === "coctel") return "bebida";
  if (t === "plato" || t === "postre" || t === "menu" || t === "otro") return "plato";
  return null;
}

/**
 * Cuando no hay tipo explícito, infiere solo `plato` | `bebida` desde texto de carta (categoría + nombre).
 * No modifica `categoria` / `categoriaCartaId`.
 */
export function inferTipoVentaFromCartaText(categoria: string, nombre: string): TipoProductoVenta {
  const blob = NORM_TEXT(`${categoria} ${nombre}`);
  if (
    /\b(vino|cava|champagne|champan|sangria|cerveza|refresco|zumo|jugo|agua\b|water\b|bebida|copa\b|whisky|ron\b|ginebra|vermut|licor|spritz|aperol)\b/.test(blob) ||
    /\b(vinos|bodega|destilados|licores|cervezas|refrescos|espumosos|espumante|prosecco)\b/.test(blob) ||
    /\b(rosado|rosados|tinto|tintos|blanco|blancos|wine|wines|sparkling)\b/.test(blob) ||
    /\b(cafe|expresso|espresso|cappuccino|capuchino|latte|carajillo)\b/.test(blob) ||
    /\b(cocktail|coctel|mojito|gin tonic|margarita|daiquiri)\b/.test(blob)
  ) {
    return "bebida";
  }
  if (
    /\b(entrante|primeros|segundos|principal|pasta|pizzas?|arroces|paella|racione?s?|tapa|pincho|ensalada|carne|pescado|marisco|hamburguesa|sandwich|bocadillo)\b/.test(blob) ||
    /\b(postre|postres|dulce|helado|tarta|brownie|flan)\b/.test(blob) ||
    /\b(menu|menu del dia)\b/.test(blob)
  ) {
    return "plato";
  }
  return "plato";
}

/** Línea de venta al cliente (plato, bebida, menú, etc.). Nombre histórico `PlatoCarta` en código. */
export type PlatoCarta = {
  id: string;
  restauranteId: string;
  nombre: string;
  /** Área operativa donde se prepara el producto (p. ej. cocina, barra, cocteleria). */
  preparationArea?: string;
  /** Tipo de artículo vendible (no confundir con categoría de carta). */
  tipoVenta: TipoProductoVenta;
  /** Texto de categoría en carta (denormalizado desde la categoría gestionada). */
  categoria: string;
  /** Id de categoría gestionada (`cartaCategorias`); opcional para datos legados solo con texto. */
  categoriaCartaId?: string;
  /** Familia de menú (`cartaFamilias`); denormalizado desde la categoría. Distinto de `familyId` (modificadores). */
  cartaFamiliaId?: string;
  /** Orden dentro de la categoría en listados (menor = primero). */
  ordenEnCategoria?: number;
  precioVenta: number;
  activo: boolean;
  fotoUrl?: string;
  descripcion?: string;
  /**
   * Estado de coste/escandallo (compatibilidad hacia atrás):
   * - Históricamente se infería solo por `escandalloSupabaseId`.
   * - Estos campos son opcionales para no romper datos antiguos.
   */
  tieneEscandallo?: boolean;
  estadoCoste?: "pendiente" | "ok";
  origenAlta?: "manual" | "importacion_ia";
  /**
   * MVP: Familias + modificadores (hostelería).
   * - `familyId`: vínculo a una entidad familia (no confundir con `categoria` de carta)
   * - `admiteModificadores`: activa/desactiva modificadores a nivel producto
   * - `gruposModificadoresIds`: grupos asignados explícitamente al producto
   *
   * No rompe nada existente: todo es opcional.
   */
  familyId?: string;
  admiteModificadores?: boolean;
  gruposModificadoresIds?: string[];
  /** Fila en Supabase `escandallos` (ingredientes / coste). */
  escandalloSupabaseId: number | null;
  createdAt: string;
  updatedAt: string;
};

/** Alias semántico para nuevas referencias. */
export type ProductoVenta = PlatoCarta;

type RootStore = Record<string, PlatoCarta[]>;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `plt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readRoot(): RootStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PLATOS_LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as RootStore;
  } catch {
    return {};
  }
}

function writeRoot(root: RootStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PLATOS_LOCAL_STORAGE_KEY, JSON.stringify(root));
    window.dispatchEvent(new Event(PLATOS_CHANGED_EVENT));
  } catch {
    /* noop */
  }
}

export function loadPlatos(restauranteId: string): PlatoCarta[] {
  const root = readRoot();
  const list = root[restauranteId];
  if (!Array.isArray(list)) return [];
  return list.map((raw: unknown) => {
    const p = raw as PlatoCarta;
    const inferredTieneEsc = p?.escandalloSupabaseId != null;
    const cat = typeof p?.categoria === "string" ? p.categoria.trim() : "";
    const nom = typeof p?.nombre === "string" ? p.nombre.trim() : "";
    return {
      ...p,
      tipoVenta:
        parseTipoVentaLoose(p?.tipoVenta) ?? inferTipoVentaFromCartaText(cat || "General", nom),
      // Fallback seguro para datos antiguos.
      tieneEscandallo: typeof p?.tieneEscandallo === "boolean" ? p.tieneEscandallo : inferredTieneEsc,
      estadoCoste: p?.estadoCoste === "ok" || p?.estadoCoste === "pendiente" ? p.estadoCoste : inferredTieneEsc ? "ok" : "pendiente",
      origenAlta: p?.origenAlta === "importacion_ia" || p?.origenAlta === "manual" ? p.origenAlta : "manual",
    };
  });
}

export function savePlatos(restauranteId: string, platos: PlatoCarta[]): void {
  const root = readRoot();
  root[restauranteId] = platos;
  writeRoot(root);
}

export function newPlatoId(): string {
  return newId();
}

export function createPlatoDraft(
  restauranteId: string,
  partial: Partial<
    Pick<
      PlatoCarta,
      | "nombre"
      | "preparationArea"
      | "tipoVenta"
      | "categoria"
      | "categoriaCartaId"
      | "cartaFamiliaId"
      | "ordenEnCategoria"
      | "precioVenta"
      | "activo"
      | "fotoUrl"
      | "descripcion"
    >
  >,
): PlatoCarta {
  const now = new Date().toISOString();
  const cat = (partial.categoria != null ? partial.categoria : "").trim();
  const nom = (partial.nombre ?? "").trim();
  const tipoVenta: TipoProductoVenta =
    parseTipoVentaLoose(partial.tipoVenta) ?? inferTipoVentaFromCartaText(cat || "General", nom);
  return {
    id: newId(),
    restauranteId,
    nombre: (partial.nombre ?? "").trim(),
    preparationArea: partial.preparationArea?.trim() || undefined,
    tipoVenta,
    categoria: (partial.categoria != null ? partial.categoria : "").trim(),
    categoriaCartaId: partial.categoriaCartaId?.trim() || undefined,
    cartaFamiliaId: partial.cartaFamiliaId?.trim() || undefined,
    ordenEnCategoria:
      typeof partial.ordenEnCategoria === "number" && Number.isFinite(partial.ordenEnCategoria)
        ? partial.ordenEnCategoria
        : undefined,
    precioVenta: typeof partial.precioVenta === "number" && Number.isFinite(partial.precioVenta) ? Math.max(0, partial.precioVenta) : 0,
    activo: partial.activo !== false,
    fotoUrl: partial.fotoUrl?.trim() || undefined,
    descripcion: partial.descripcion?.trim() || undefined,
    tieneEscandallo: false,
    estadoCoste: "pendiente",
    origenAlta: "manual",
    escandalloSupabaseId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Tras guardar coste/precio en la lista de escandallos, alinear precio en carta si existe vínculo. */
export function syncPlatoPrecioFromEscandalloSave(restauranteId: string, escandalloSupabaseId: number, precioVenta: number | null): void {
  if (precioVenta == null || !Number.isFinite(precioVenta)) return;
  const platos = loadPlatos(restauranteId);
  const idx = platos.findIndex((p) => p.escandalloSupabaseId === escandalloSupabaseId);
  if (idx < 0) return;
  const p = platos[idx];
  if (p.precioVenta === precioVenta) return;
  const next = [...platos];
  next[idx] = { ...p, precioVenta, updatedAt: new Date().toISOString() };
  savePlatos(restauranteId, next);
}

export function setPlatoEscandalloId(restauranteId: string, platoId: string, escandalloSupabaseId: number | null): void {
  const platos = loadPlatos(restauranteId);
  const idx = platos.findIndex((p) => p.id === platoId);
  if (idx < 0) return;
  const now = new Date().toISOString();
  const next = [...platos];
  next[idx] = { ...next[idx], escandalloSupabaseId, updatedAt: now };
  savePlatos(restauranteId, next);
}
