import { isMenuCourse } from "@/lib/carta/menu-course";
import {
  buildProductStationPatchFromSelectValue,
  isNoneOperationStationSelectValue,
} from "@/lib/operacion/product-operation-station";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";

export type ProductFormPreventiveValidationInput = {
  tipoVenta: "plato" | "bebida";
  active: boolean;
  categoryId: string | null;
  hasProductFamily: boolean;
  operationStationSelect: string;
  operationStations: readonly OperationStationDocument[];
  /** Valor del select de pase (`""` = sin pase). */
  courseSelectValue: string;
  /** Bebidas / estaciones que omiten pase en el formulario. */
  skipsMenuCourse: boolean;
  validateCourse: boolean;
};

export type ProductFormPreventiveValidationResult = {
  blockingErrors: string[];
  warnings: string[];
};

/** Aviso informativo: activo sin familia; nunca bloquea guardado. */
export const PRODUCT_FORM_ACTIVE_NO_FAMILY_WARNING =
  "El producto activo no tiene familia de producto asignada.";

/** Errores que sí impiden guardar (excluye avisos de familia). */
export function getProductFormSubmitBlockingErrors(
  result: ProductFormPreventiveValidationResult,
): string[] {
  return result.blockingErrors.filter(
    (message) => message !== PRODUCT_FORM_ACTIVE_NO_FAMILY_WARNING,
  );
}

function resolveCanonicalStationFromSelect(
  operationStationSelect: string,
  operationStations: readonly OperationStationDocument[],
): string | null {
  const patch = buildProductStationPatchFromSelectValue(
    operationStationSelect,
    operationStations,
  );
  const raw = String(patch.station ?? "").trim().toLowerCase();
  if (raw === "kitchen" || raw === "cocina") return "kitchen";
  if (raw === "bar" || raw === "barra") return "bar";
  if (raw === "cocktail" || raw === "cocteleria") return "cocktail";
  if (raw === "none") return "none";
  return raw || null;
}

function hasOperationStationIdOnSave(
  operationStationSelect: string,
  operationStations: readonly OperationStationDocument[],
): boolean {
  const patch = buildProductStationPatchFromSelectValue(
    operationStationSelect,
    operationStations,
  );
  return Boolean(patch.operationStationId?.trim());
}

function isCourseSelectValueInvalid(courseSelectValue: string): boolean {
  const v = courseSelectValue.trim();
  if (!v) return false;
  const n = Math.floor(Number(v));
  return !Number.isFinite(n) || !isMenuCourse(n);
}

/**
 * Validaciones preventivas del formulario de producto (solo UI; no persiste).
 */
export function evaluateProductFormPreventiveValidation(
  input: ProductFormPreventiveValidationInput,
): ProductFormPreventiveValidationResult {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (input.active && !input.categoryId?.trim()) {
    blockingErrors.push(
      "El producto activo debe tener una categoría de carta.",
    );
  }

  if (
    input.validateCourse &&
    input.tipoVenta !== "bebida" &&
    !input.skipsMenuCourse &&
    isCourseSelectValueInvalid(input.courseSelectValue)
  ) {
    blockingErrors.push(
      "El pase por defecto debe estar entre 1 y 4, o dejarse sin pase.",
    );
  }

  const station = resolveCanonicalStationFromSelect(
    input.operationStationSelect,
    input.operationStations,
  );

  if (input.tipoVenta === "bebida" && station === "kitchen") {
    warnings.push(
      "Las bebidas normalmente deben enviarse a Barra o Coctelería.",
    );
  }

  if (
    input.tipoVenta === "plato" &&
    (station === "bar" || station === "cocktail")
  ) {
    warnings.push("Los platos normalmente deben enviarse a Cocina.");
  }

  if (input.active && !input.hasProductFamily) {
    warnings.push(PRODUCT_FORM_ACTIVE_NO_FAMILY_WARNING);
  }

  if (
    input.active &&
    (!hasOperationStationIdOnSave(
      input.operationStationSelect,
      input.operationStations,
    ) ||
      isNoneOperationStationSelectValue(input.operationStationSelect))
  ) {
    warnings.push(
      "El producto activo no tiene estación operativa asignada; en KDS puede no aparecer en el filtro por estación.",
    );
  }

  return { blockingErrors, warnings };
}
