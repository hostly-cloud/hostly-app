import type { CartaCategoriaTipo } from "./types";

/** Comportamiento operativo por defecto de una categoría de carta (barra/cocina/combinados futuros). */
export const CATEGORY_OPERATIONAL_BEHAVIOR_VALUES = [
  "simple",
  "combo_base",
  "mixer",
  "composed_recipe",
] as const;

export type CategoryOperationalBehavior =
  (typeof CATEGORY_OPERATIONAL_BEHAVIOR_VALUES)[number];

export const DEFAULT_CATEGORY_OPERATIONAL_BEHAVIOR: CategoryOperationalBehavior =
  "simple";

export function isCategoryOperationalBehavior(
  value: unknown,
): value is CategoryOperationalBehavior {
  return (
    value === "simple" ||
    value === "combo_base" ||
    value === "mixer" ||
    value === "composed_recipe"
  );
}

/** Lectura Firestore / UI: ausente o inválido → `simple`. */
export function normalizeCategoryOperationalBehavior(
  raw: unknown,
): CategoryOperationalBehavior {
  if (isCategoryOperationalBehavior(raw)) return raw;
  return DEFAULT_CATEGORY_OPERATIONAL_BEHAVIOR;
}

/** Opciones visibles según tipo de categoría (no bloquea guardado). */
export function categoryOperationalBehaviorsForType(
  type: CartaCategoriaTipo,
): readonly CategoryOperationalBehavior[] {
  if (type === "food") return ["simple", "composed_recipe"];
  return CATEGORY_OPERATIONAL_BEHAVIOR_VALUES;
}

export function defaultCategoryOperationalBehaviorForType(
  type: CartaCategoriaTipo,
): CategoryOperationalBehavior {
  void type;
  return DEFAULT_CATEGORY_OPERATIONAL_BEHAVIOR;
}

/** Al cambiar tipo en UI: mantiene valor si sigue siendo válido; si no, `simple`. */
export function coerceCategoryOperationalBehaviorForType(
  behavior: CategoryOperationalBehavior,
  type: CartaCategoriaTipo,
): CategoryOperationalBehavior {
  const allowed = categoryOperationalBehaviorsForType(type);
  return allowed.includes(behavior) ? behavior : DEFAULT_CATEGORY_OPERATIONAL_BEHAVIOR;
}

export type CategoryOperationalBehaviorLocale = "es" | "en";

export function getCategoryOperationalBehaviorLabel(
  behavior: CategoryOperationalBehavior,
  locale: CategoryOperationalBehaviorLocale = "es",
): string {
  const labels: Record<
    CategoryOperationalBehavior,
    Record<CategoryOperationalBehaviorLocale, string>
  > = {
    simple: { es: "Producto simple", en: "Simple product" },
    combo_base: { es: "Base de combinado", en: "Combo base" },
    mixer: { es: "Combinado", en: "Combinado" },
    composed_recipe: { es: "Elaboración propia", en: "House-made" },
  };
  return labels[behavior][locale];
}

export function getCategoryOperationalBehaviorShortLabel(
  behavior: CategoryOperationalBehavior,
  locale: CategoryOperationalBehaviorLocale = "es",
): string {
  const labels: Record<
    CategoryOperationalBehavior,
    Record<CategoryOperationalBehaviorLocale, string>
  > = {
    simple: { es: "Simple", en: "Simple" },
    combo_base: { es: "Base", en: "Base" },
    mixer: { es: "Combinado", en: "Combinado" },
    composed_recipe: { es: "Elaboración", en: "House-made" },
  };
  return labels[behavior][locale];
}

export function getCategoryOperationalBehaviorOptionHelp(
  behavior: CategoryOperationalBehavior,
  locale: CategoryOperationalBehaviorLocale = "es",
): string {
  const helps: Record<
    CategoryOperationalBehavior,
    Record<CategoryOperationalBehaviorLocale, string>
  > = {
    simple: {
      es: "Se vende tal cual.",
      en: "Sold as-is.",
    },
    combo_base: {
      es: "Ej. ginebra, ron, vodka.",
      en: "E.g. gin, rum, vodka.",
    },
    mixer: {
      es: "Ej. tónica, refresco, energética.",
      en: "E.g. tonic, soft drink, energy drink.",
    },
    composed_recipe: {
      es: "Ej. cóctel, sangría, preparación.",
      en: "E.g. cocktail, sangria, preparation.",
    },
  };
  return helps[behavior][locale];
}
