/**
 * Tipos de entrada del pipeline de importación inteligente.
 * Sin lógica; sin Firestore; sin proveedores IA.
 */

/** Origen que el usuario elige en la UI. */
export type MenuImportSourceKind =
  | "photo"
  | "pdf"
  | "qr"
  | "url"
  | "pasted_text";

/** Tipo de carta declarado antes del análisis (alineado con ImportedMenuCartaType). */
export type MenuImportCartaKind =
  | "comida"
  | "bebidas"
  | "vinos"
  | "cocteles"
  | "mixta";

/** Payload mínimo para arrancar un job de importación. */
export type MenuImportJobInput = {
  restaurantId: string;
  cartaKind: MenuImportCartaKind;
  sourceKind: MenuImportSourceKind;
  /** Etiqueta humana (nombre archivo, URL truncada, etc.). */
  sourceLabel?: string;
  /** Texto pegado directo (sourceKind === "pasted_text"). */
  pastedText?: string;
  /** URL explícita o resuelta desde QR (sourceKind === "url" | "qr"). */
  sourceUrl?: string;
  /** Ruta Storage del archivo subido (photo | pdf). */
  storagePath?: string;
  /** MIME del archivo cuando aplique. */
  mimeType?: string;
  /** Usuario que inició la importación (auditoría futura). */
  initiatedByUserId?: string;
};

/** Fuente ya resuelta y lista para extracción de texto. */
export type ResolvedMenuImportSource = {
  kind: MenuImportSourceKind;
  restaurantId: string;
  cartaKind: MenuImportCartaKind;
  /** Texto inline cuando no hace falta OCR (pasted_text o HTML ya convertido). */
  inlineText?: string;
  /** Bytes del documento cuando la extracción requiere OCR/parser binario. */
  fileBytes?: Uint8Array;
  mimeType?: string;
  sourceUrl?: string;
  storagePath?: string;
  sourceLabel?: string;
};
