import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import type { OperationStationType } from "@/lib/operacion/operation-station-types";

export type ProductAllergen =
  | "gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "peanuts"
  | "soybeans"
  | "milk"
  | "nuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

export type ProductWineStyle =
  | "red"
  | "white"
  | "rose"
  | "sparkling"
  | "sweet"
  | "fortified"
  | "unknown";

export type ProductWineBody = "light" | "medium" | "full" | "unknown";
export type ProductWineSweetness = "dry" | "off_dry" | "sweet" | "unknown";

export type ProductWineProfile = {
  style?: ProductWineStyle;
  body?: ProductWineBody;
  sweetness?: ProductWineSweetness;
  grapes?: string[];
  region?: string;
  denomination?: string;
  country?: string;
  vintage?: number | null;
  abv?: number | null;
  tastingNotes?: string[];
};

export type ProductGastronomy = {
  /** Descripción gastronómica visible para sala/TPV/Sommelier. */
  description?: string;
  /** Ingredientes confirmados por el restaurante. */
  ingredients?: string[];
  /** Alérgenos UE confirmados. Ausencia del campo significa "sin información", no "sin alérgenos". */
  allergens?: ProductAllergen[];
  /** Energía aproximada/confirmada por ración. */
  caloriesKcal?: number | null;
  /** Perfil enológico canónico cuando el producto es un vino. */
  wine?: ProductWineProfile;
};

export type Product = {
  id: string;
  nombre: string;
  categoria: string;
  /** Id del documento de categoría en Firestore, si existe en el documento. */
  categoryId?: string;
  /** Familia denormalizada desde categoría (`productFamilies`). */
  productFamilyId?: string;
  productFamilyName?: string;
  productFamilyType?: ProductFamilyType;
  /** Tipo de venta en catálogo (`plato` | `bebida`). */
  tipoVenta?: string;
  /** Grupos de modificadores asignados directamente al producto. */
  modifierGroupIds?: string[];
  precio: number;
  /** Tipo de IVA en puntos básicos (10 % = 1000). */
  vatRateBps?: number | null;
  /** Posición dentro de `categoryId` (menor = primero en TPV). */
  sortOrder?: number;
  /** Pase / curso del catálogo (1–4: entrante…postre). Opcional en datos legados. */
  course?: number | null;
  /** Área operativa donde se prepara el producto (p. ej. cocina, barra, cocteleria). */
  preparationArea?: string;
  /** Estación canónica central (kitchen | bar | cocktail). */
  station?: string;
  /** Estación operativa configurable (`operationStations`). */
  operationStationId?: string;
  operationStationName?: string;
  operationStationType?: OperationStationType;
  /** Metadatos gastronómicos canónicos; opcionales para compatibilidad con productos existentes. */
  gastronomy?: ProductGastronomy;
  createdAt?: number;
  /** Dueño del documento en Firestore (Firebase Auth uid). */
  userId?: string;
  /** Restaurante / tenant; por ahora coincide con el uid del dueño. */
  restaurantId?: string;
  imageUrl?: string;
  imagePath?: string;
};
