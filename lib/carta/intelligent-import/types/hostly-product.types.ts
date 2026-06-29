/**
 * Candidatos al modelo de producto Hostly (pre-publicación).
 * Alineación futura con ImportedMenuItem / products Firestore.
 */

export type HostlySuggestedStation =
  | "kitchen"
  | "bar"
  | "cocktail"
  | "none";

export type HostlyMenuProductCandidate = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  sectionName: string;
  suggestedCategory: string;
  suggestedStation: HostlySuggestedStation;
  confidence: number;
  needsReview: boolean;
  selectedForPublish: boolean;
  sourceItemId: string;
  warnings?: string[];
};

export type HostlyMenuImportCandidates = {
  products: HostlyMenuProductCandidate[];
  mapperId: string;
  /** Para mapear a ImportedMenuDraft en migración. */
  cartaKind: import("./source.types").MenuImportCartaKind;
};
