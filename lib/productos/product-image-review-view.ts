import type {
  ProductImageReviewResolvedState,
} from "@/lib/productos/product-image-review-contract";

export type ProductImageReviewUiAction =
  | "generate"
  | "regenerate"
  | "approve"
  | "reject";

export type ProductImageReviewView = {
  sourceLabel: string;
  statusLabel: string;
  statusTone: "neutral" | "info" | "success" | "warning" | "danger";
  actions: ProductImageReviewUiAction[];
  guidance: string | null;
};

export function productImageGenerationReasonLabel(
  reason: ProductImageReviewResolvedState["generationReason"],
): string | null {
  switch (reason) {
    case "not_imported":
      return "Disponible para platos creados desde Importar carta.";
    case "not_food":
      return "Las imágenes generadas se limitan por ahora a platos de comida.";
    case "branded_or_beverage":
      return "Las marcas, bebidas y vinos necesitan una coincidencia real, no una imagen inventada.";
    case "invalid_product_name":
      return "Completa un nombre de producto válido antes de generar.";
    case "protected_existing_image":
      return "La imagen actual está protegida y no puede sustituirse automáticamente.";
    case "generation_in_progress":
      return "Hostly ya está generando una imagen para este producto.";
    default:
      return null;
  }
}

export function buildProductImageReviewView(
  state: ProductImageReviewResolvedState,
  localImageDraftDirty = false,
): ProductImageReviewView {
  const sourceLabel =
    state.source === "manual"
      ? "Manual"
      : state.source === "ai_generated"
        ? "IA"
        : state.source === "catalog_exact"
          ? "Catálogo exacto"
          : state.source === "legacy"
            ? "Imagen anterior"
            : "Sin imagen";

  const statusLabel =
    state.reviewStatus === "approved"
      ? "Aprobada"
      : state.reviewStatus === "pending"
        ? "Pendiente de revisión"
        : state.reviewStatus === "rejected"
          ? "Rechazada"
          : state.reviewStatus === "protected"
            ? "Protegida"
            : "Sin revisar";

  const statusTone: ProductImageReviewView["statusTone"] =
    state.reviewStatus === "approved"
      ? "success"
      : state.reviewStatus === "pending"
        ? "warning"
        : state.reviewStatus === "rejected"
          ? "danger"
          : state.reviewStatus === "protected"
            ? "neutral"
            : "info";

  if (localImageDraftDirty) {
    return {
      sourceLabel,
      statusLabel,
      statusTone,
      actions: [],
      guidance: "Guarda o descarta primero el cambio manual de imagen.",
    };
  }

  const actions: ProductImageReviewUiAction[] = [];
  if (state.canApprove) actions.push("approve");
  if (state.canGenerate) {
    actions.push(state.hasImage ? "regenerate" : "generate");
  }
  if (state.canReject) actions.push("reject");

  const guidance =
    state.reviewStatus === "pending"
      ? "Comprueba que la imagen representa correctamente el plato antes de aprobarla."
      : state.reviewStatus === "rejected"
        ? "Puedes regenerar una alternativa; la imagen rechazada no queda bloqueada."
        : state.reviewStatus === "approved"
          ? "La imagen está aprobada y protegida frente a sustituciones automáticas."
          : productImageGenerationReasonLabel(state.generationReason);

  return { sourceLabel, statusLabel, statusTone, actions, guidance };
}
