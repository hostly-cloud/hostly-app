import type { MenuImportSourceKind } from "../types/source.types";

/** Metadatos por tipo de entrada (routing UI → pipeline, sin lógica). */
export type MenuImportSourceKindMeta = {
  kind: MenuImportSourceKind;
  label: string;
  requiresStorage: boolean;
  requiresUrl: boolean;
  allowsInlineText: boolean;
  /** Si true, la etapa extract_text usará OCR o fetch remoto. */
  usesTextExtraction: boolean;
};

export const MENU_IMPORT_SOURCE_KIND_META: Record<
  MenuImportSourceKind,
  MenuImportSourceKindMeta
> = {
  photo: {
    kind: "photo",
    label: "Foto",
    requiresStorage: true,
    requiresUrl: false,
    allowsInlineText: false,
    usesTextExtraction: true,
  },
  pdf: {
    kind: "pdf",
    label: "PDF",
    requiresStorage: true,
    requiresUrl: false,
    allowsInlineText: false,
    usesTextExtraction: true,
  },
  qr: {
    kind: "qr",
    label: "Código QR",
    requiresStorage: false,
    requiresUrl: true,
    allowsInlineText: false,
    usesTextExtraction: true,
  },
  url: {
    kind: "url",
    label: "URL",
    requiresStorage: false,
    requiresUrl: true,
    allowsInlineText: false,
    usesTextExtraction: true,
  },
  pasted_text: {
    kind: "pasted_text",
    label: "Texto pegado",
    requiresStorage: false,
    requiresUrl: false,
    allowsInlineText: true,
    usesTextExtraction: false,
  },
};
