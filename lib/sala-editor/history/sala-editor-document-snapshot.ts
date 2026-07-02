import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

export function cloneSalaEditorDocument(
  document: SalaEditorDocument,
): SalaEditorDocument {
  if (typeof structuredClone === "function") {
    return structuredClone(document);
  }
  return JSON.parse(JSON.stringify(document)) as SalaEditorDocument;
}

export function areSalaEditorDocumentsEqual(
  left: SalaEditorDocument,
  right: SalaEditorDocument,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
