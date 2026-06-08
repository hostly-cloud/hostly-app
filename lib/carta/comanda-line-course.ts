import { normalizeComandaCourseValue } from "@/lib/carta/comanda-line-release";
import { readItemCourseFromRecord } from "@/lib/carta/menu-course";
import { isTpvDrinkProduct } from "@/lib/carta/tpv-menu-group";
import type { Product } from "@/types/product";

/** Lee `course` o alias legacy `pase` desde un ítem de order Firestore. */
export function readComandaLineCourseFromFirestoreRecord(
  rec: Record<string, unknown>,
): number | undefined {
  const n = readItemCourseFromRecord(rec);
  return n > 0 ? n : undefined;
}

type ProductCourseSource = Pick<
  Product,
  | "course"
  | "nombre"
  | "categoria"
  | "productFamilyType"
  | "tipoVenta"
> & {
  categoryName?: unknown;
  category?: unknown;
  familia?: unknown;
  family?: unknown;
};

/**
 * Pase por defecto del catálogo al añadir a comanda.
 * - `course` explícito 1–4 en producto → ese pase.
 * - `course: null` → sin pase (no inferir por nombre/categoría).
 * - Campo ausente (legacy) → heurística por texto; si no hay match, entrante (1).
 */
export function resolveProductDefaultCourse(
  product: ProductCourseSource,
): number | undefined {
  if ("course" in product) {
    if (product.course == null) return undefined;
    const explicitCourse = normalizeComandaCourseValue(product.course);
    if (explicitCourse) return explicitCourse;
  }

  if (
    isTpvDrinkProduct({
      productFamilyType: product.productFamilyType,
      categoryName: product.categoria,
      categoria: product.categoria,
      tipoVenta: product.tipoVenta,
    })
  ) {
    return undefined;
  }

  const raw =
    `${product.nombre ?? ""} ${product.categoria ?? ""} ${product.categoryName ?? ""} ${product.category ?? ""} ${product.familia ?? ""} ${product.family ?? ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  if (
    raw.includes("postre") ||
    raw.includes("dessert") ||
    raw.includes("tarta") ||
    raw.includes("dulce")
  ) {
    return 4;
  }

  if (
    raw.includes("pescado") ||
    raw.includes("carne") ||
    raw.includes("hamburgues") ||
    raw.includes("principal") ||
    raw.includes("segundo")
  ) {
    return 3;
  }

  if (
    raw.includes("arroz") ||
    raw.includes("paella") ||
    raw.includes("primero")
  ) {
    return 2;
  }

  if (
    raw.includes("entrante") ||
    raw.includes("ensalada") ||
    raw.includes("extra")
  ) {
    return 1;
  }

  return 1;
}

type ComandaLineCourseSource = {
  course?: number;
  product?: ProductCourseSource;
};

/**
 * Pase efectivo de una línea: primero `line.course`, luego catálogo embebido en `product`.
 */
export function resolveEffectiveComandaLineCourse(
  line: ComandaLineCourseSource,
): number | undefined {
  const fromLine = normalizeComandaCourseValue(line.course);
  if (fromLine != null) return fromLine;
  if (line.product) return resolveProductDefaultCourse(line.product);
  return undefined;
}

/** Agrupación TPV/KDS: sin pase explícito en comida de cocina → entrante (1). */
export function resolveComandaLineCourseNum(
  line: ComandaLineCourseSource,
): number {
  return resolveEffectiveComandaLineCourse(line) ?? 1;
}
