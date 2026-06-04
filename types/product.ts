import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import type { OperationStationType } from "@/lib/operacion/operation-station-types";

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
  createdAt?: number;
  /** Dueño del documento en Firestore (Firebase Auth uid). */
  userId?: string;
  /** Restaurante / tenant; por ahora coincide con el uid del dueño. */
  restaurantId?: string;
  imageUrl?: string;
  imagePath?: string;
};
