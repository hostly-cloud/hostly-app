/** Origen del material enviado a importación (sin backend todavía). */
export type ImportedMenuSourceType = "image" | "pdf" | "qr_url";

/** Tipo de carta que el usuario indica antes del análisis. */
export type ImportedMenuCartaType = "comida" | "bebidas" | "vinos" | "cocteles" | "mixta";

/** Estación operativa sugerida por la IA mock. */
export type ImportedMenuSuggestedStation = "kitchen" | "bar" | "cocktail" | "none";

/** Atributos inferidos por IA estructurada (sin inventar productos). */
export type ImportedMenuInferredAttributes = {
  wineByGlass?: boolean;
  bottle?: boolean;
  spicy?: boolean;
  vegetarian?: boolean;
  vegan?: boolean;
  cocktail?: boolean;
  coffee?: boolean;
};

export type ImportedMenuItemPublishStatus = "published" | "skipped" | "error";

export type ImportedMenuItem = {
  id: string;
  sourceType: ImportedMenuSourceType;
  name: string;
  description?: string;
  price?: number;
  sectionName: string;
  suggestedCategory: string;
  suggestedStation: ImportedMenuSuggestedStation;
  /** 0–100 */
  confidence: number;
  rawText?: string;
  needsReview: boolean;
  selectedForPublish: boolean;
  inferredAttributes?: ImportedMenuInferredAttributes;
  /** id de otro item del mismo borrador si la IA detecta duplicado */
  duplicateOf?: string;
  aiWarnings?: string[];
  aiConfidence?: number;
  aiEnriched?: boolean;
  publishedProductId?: string;
  publishedAt?: number;
  publishStatus?: ImportedMenuItemPublishStatus;
};

export type ImportedMenuSection = {
  id: string;
  name: string;
  items: ImportedMenuItem[];
};

export type ImportedMenuDraftStatus =
  | "draft"
  | "analyzing"
  | "ready"
  | "failed"
  | "partially_published"
  | "published";

export type ImportedMenuDraft = {
  id: string;
  createdAt: string;
  sourceType: ImportedMenuSourceType;
  cartaType: ImportedMenuCartaType;
  /** Nombre de archivo o URL pegada (solo UI). */
  sourceLabel?: string;
  sections: ImportedMenuSection[];
  status?: ImportedMenuDraftStatus;
  errorMessage?: string;
  storagePath?: string;
  sourceUrl?: string;
  aiWarnings?: string[];
};

export const IMPORTED_MENU_CARTA_TYPE_LABELS: Record<ImportedMenuCartaType, string> = {
  comida: "Comida",
  bebidas: "Bebidas",
  vinos: "Vinos",
  cocteles: "Cócteles",
  mixta: "Mixta",
};

export const IMPORTED_MENU_STATION_LABELS: Record<ImportedMenuSuggestedStation, string> = {
  kitchen: "Cocina",
  bar: "Bar",
  cocktail: "Coctelería",
  none: "Sin estación",
};

export const IMPORTED_MENU_STATION_OPTIONS: ImportedMenuSuggestedStation[] = [
  "kitchen",
  "bar",
  "cocktail",
  "none",
];
