/** Proveedor canónico local (mock hasta Firestore). */
export type CanonicalSupplier = {
  id: string;
  displayName: string;
  legalName: string;
  /** Textos alternativos normalizados vía matching (typos, marcas, OCR futuro). */
  aliases: string[];
};
