/** Canonical service course on order lines: 1 Entrante … 4 Postre. */
export type MenuCourse = 1 | 2 | 3 | 4;

export const MENU_COURSE_MIN = 1;
export const MENU_COURSE_MAX = 4;

/** Read `course` from Firestore order item (`pase` legacy alias). */
export function readItemCourseFromRecord(rec: Record<string, unknown>): number {
  const raw = rec.course ?? rec.pase;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const u = Math.floor(n);
  if (u === 0) return 0;
  if (u >= MENU_COURSE_MIN && u <= MENU_COURSE_MAX) return u;
  return Math.min(MENU_COURSE_MAX, Math.max(MENU_COURSE_MIN, u));
}

export function isMenuCourse(course: number): course is MenuCourse {
  return (
    Number.isInteger(course) &&
    course >= MENU_COURSE_MIN &&
    course <= MENU_COURSE_MAX
  );
}

/** Singular label for badges and line chips. */
export function getMenuCourseLabel(course: number): string {
  switch (course) {
    case 1:
      return "Entrante";
    case 2:
      return "Primero";
    case 3:
      return "Segundo";
    case 4:
      return "Postre";
    default:
      return "";
  }
}

/** Plural section title for grouped KDS/Sala blocks. */
export function getMenuCourseSectionLabel(course: number): string {
  switch (course) {
    case 1:
      return "Entrantes";
    case 2:
      return "Primeros";
    case 3:
      return "Segundos";
    case 4:
      return "Postres";
    default:
      return "Sin pase";
  }
}

export function sortMenuCourseKey(course: number): number {
  if (course === 0) return 999;
  if (isMenuCourse(course)) return course;
  return 998;
}

/** Group key for course sections: one bucket per course 1–4 (no merging). */
export function menuCourseGroupKey(course: number): number {
  return isMenuCourse(course) ? course : 0;
}

/** Homogeneous pass chunk label (kitchen/bar temporal batches). */
export function getHomogeneousPassChunkTypeLabel(
  lines: ReadonlyArray<{ course?: number }>,
): string {
  if (lines.length === 0) return "Mixto";
  if (lines.every((l) => l.course === 1)) return "Entrantes";
  if (lines.every((l) => l.course === 2)) return "Primeros";
  if (lines.every((l) => l.course === 3)) return "Segundos";
  if (lines.every((l) => l.course === 4)) return "Postres";
  return "Mixto";
}

/** Valores de pase en catálogo de producto (`restaurants/.../products`). */
export type ProductCatalogCourse = MenuCourse | null;

const PRODUCT_COURSE_SELECT_NONE = "";

/** Valor del `<select>` de productos: "" = sin pase (null en Firestore). */
export function productCatalogCourseSelectValue(
  course: ProductCatalogCourse | number | null | undefined,
): string {
  if (course == null || course === undefined) return PRODUCT_COURSE_SELECT_NONE;
  const n = Math.floor(Number(course));
  return isMenuCourse(n) ? String(n) : PRODUCT_COURSE_SELECT_NONE;
}

/** Parsea selección UI → valor Firestore (`null` = sin pase, 1–4 = pase). */
export function productCatalogCourseFromSelectValue(
  value: string,
): ProductCatalogCourse {
  const v = value.trim();
  if (!v || v === PRODUCT_COURSE_SELECT_NONE) return null;
  const n = Math.floor(Number(v));
  return isMenuCourse(n) ? n : null;
}

/** Lee `course` del documento central; `undefined` = campo ausente (legacy). */
export function readProductCatalogCourseFromRecord(
  rec: Record<string, unknown>,
): ProductCatalogCourse | undefined {
  if (!Object.prototype.hasOwnProperty.call(rec, "course")) return undefined;
  const raw = rec.course;
  if (raw == null || raw === "") return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return null;
  return isMenuCourse(n) ? n : null;
}

export function getProductCatalogCourseLabel(
  course: ProductCatalogCourse | undefined,
): string {
  if (course == null || course === undefined) return "Sin pase";
  return getMenuCourseLabel(course) || "Sin pase";
}
