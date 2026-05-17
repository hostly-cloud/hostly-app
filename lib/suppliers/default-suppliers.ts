import type { CanonicalSupplier } from "./types";

/**
 * Catálogo mock estable. Sustituible por Firestore sin cambiar firmas de matching.
 */
export const DEFAULT_SUPPLIERS: readonly CanonicalSupplier[] = [
  {
    id: "be-drinks",
    displayName: "Be Drinks",
    legalName: "Be Drinks S.L.",
    aliases: [
      "Be Drinks",
      "be drinks",
      "be drinks sl",
      "be drinks s.l.",
      "bedrinks",
      "be-drinks",
      "BEDRINKS",
    ],
  },
  {
    id: "aqualia",
    displayName: "Aqualia",
    legalName: "Aqualia S.L.",
    aliases: ["Aqualia", "cualia", "aqualia agua", "Aqualia agua", "aqualia sl", "aguas aqualia"],
  },
] as const;
